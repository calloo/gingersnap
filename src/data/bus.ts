import { Observable, ObservableEventTarget, ObservableMessagePort } from "../stream/observable";
import { Future, WaitPeriod } from "../future";
import { Stream } from "../stream";

/**
 * A controller than manages exchanging data between various consumers
 */
export class DataBus<T = any> extends Observable<T> {
  private readonly observables: Map<string, Observable<T>>;

  constructor() {
    super();
    this.observables = new Map();
  }

  /**
   * Used inside a WebWorker to accept incoming Observable, that grants
   * connection to a DataBus
   */
  static workerJoin<T>() {
    return Future.of<Observable<T>>((resolve, _, signal) => {
      const listener = (evt) => {
        if (evt.data.command === "__join_data_bus__") {
          resolve(new ObservableMessagePort(evt.ports[0]));
        }
      };
      signal.onabort = () => self.removeEventListener("message", listener);
      self.addEventListener("message", listener, { once: true });
    });
  }

  /**
   * Redirects incoming messages from a particular consumer to one or more other
   * consumers
   * @param topic used to listen to specific incoming message
   * @param consumer the consumer to republish data to. to send to all consumers, set value to '*'
   * @param topicTransformer allows changing the topic of the incoming data that should be republished (optional)
   * @param bufferSize
   * @param expiryPeriod
   */
  republish(
    topic: string,
    consumer: string,
    topicTransformer: (v: string) => string = (v) => v,
    bufferSize: number | undefined = undefined,
    expiryPeriod: WaitPeriod | undefined = undefined
  ) {
    return this.subscribe(topic, bufferSize, expiryPeriod)
      .map(({ topic: consumerTopic, data }) => this.publish(`${consumer}.${topicTransformer(consumerTopic)}`, data))
      .consume()
      .schedule();
  }

  /**
   * Dispatches message to specific consumers listen on the given topic
   * Format is [consumer/s].[topic]
   * E.g 1: jobs.submission, where a consumer is named 'jobs' and is listening for
   * messages on the topic 'submission'
   *
   * E.g 2: *.submission, where any consumer that is listening for messages on the
   * topic 'submission'
   *
   * E.g 3: [users,admins].signup where consumer named 'users' and consumer named
   * 'admins' is listening for messages on the topic 'signup'
   *
   * @param topic
   * @param data
   */
  publish(topic: string, data: T): void {
    if (topic.startsWith("*.")) {
      this.observables.forEach((observable) => observable.publish(topic.substring(2), data));
    } else {
      const [consumer, realTopic] = topic.split(".", 2);
      const observables: Array<Observable<T>> = [];

      if (consumer.startsWith("[") && consumer.endsWith("]")) {
        observables.push(
          ...consumer
            .substring(1, consumer.length - 1)
            .split(",")
            .map((v) => {
              const observable = this.observables.get(v.trim());
              if (!observable) {
                throw new Error(`Invalid observer ${v}`);
              }

              return observable;
            })
        );
      } else {
        const observable = this.observables.get(consumer);
        if (!observable) {
          throw new Error(`Invalid observer ${consumer}`);
        }

        observables.push(observable);
      }

      observables.forEach((observable) => observable.publish(realTopic, data));
    }
  }

  /**
   * Subscribes to incoming messages on the given topic, where topic represents
   * [consumer/s].topic
   * @param topic
   * @param bufferSize
   * @param expiryPeriod
   */
  subscribe(
    topic: string | RegExp,
    bufferSize?: number,
    expiryPeriod?: WaitPeriod
  ): Stream<{
    topic: string;
    data: T;
  }> {
    if (typeof topic === "string") {
      if (topic.startsWith("*.")) {
        return Stream.merge(
          Array.from(this.observables.values()).map((observable) =>
            observable.subscribe(topic.substring(2), bufferSize, expiryPeriod)
          )
        );
      } else {
        const [consumer, realTopic] = topic.split(".", 2);
        const observables: Array<Observable<T>> = [];

        if (consumer.startsWith("[") && consumer.endsWith("]")) {
          observables.push(
            ...consumer
              .substring(1, consumer.length - 1)
              .split(",")
              .map((v) => {
                const observable = this.observables.get(v);
                if (!observable) {
                  throw new Error(`Invalid observer ${v}`);
                }

                return observable;
              })
          );
        } else {
          const observable = this.observables.get(consumer);
          if (!observable) {
            throw new Error(`Invalid observer ${consumer}`);
          }

          observables.push(observable);
        }

        return Stream.merge(
          Array.from(observables.values()).map((observable) =>
            observable.subscribe(realTopic, bufferSize, expiryPeriod)
          )
        );
      }
    }

    return Stream.merge(
      Array.from(this.observables.entries()).map(([key, observable]) =>
        observable
          .subscribe("*", bufferSize, expiryPeriod)
          .filter(({ topic: subTopic }) => topic.test(`${key}.${subTopic}`))
      )
    );
  }

  /**
   * Registers a WebWorker as a consumer. The worker needs to accept the connection
   * by calling DataBus.workerJoin()
   * @param worker
   * @param name
   * @param workerBufferSize
   */
  connectWorker(worker: Worker, name: string, workerBufferSize: number | undefined = undefined) {
    if (name.includes(".")) {
      throw new Error("period cannot exist in consumer name");
    }
    if (this.observables.has(name)) {
      throw new Error("worker already added");
    }
    const { port1, port2 } = new MessageChannel();
    worker.postMessage(
      {
        command: "__join_data_bus__",
        workerName: name,
      },
      [port2]
    );
    const observable = new ObservableMessagePort<T>(port1);
    this.observables.set(name, observable);
  }

  /**
   * Provides a consumer with a connection to the data bus, where the consumer
   * can dispatch messages and respond to other data
   * @param name name required for consumer to receive incoming messages. Will be
   * used as a part of the topics when message is being dispatched
   */
  connectConsumer(name: string): Observable<T> {
    if (name.includes(".")) {
      throw new Error("period cannot exist in consumer name");
    }
    if (this.observables.has(name)) {
      throw new Error("consumer already added");
    }
    const observable = new ObservableEventTarget<T>();
    this.observables.set(name, observable);
    return observable;
  }

  /**
   * Disconnects the given consumer from receiving messages from the bus
   * @param name
   */
  disconnectConsumer(name: string) {
    this.observables.delete(name);
  }
}
