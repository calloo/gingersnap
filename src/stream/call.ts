import { NONE, ResponseType, ThrottleByProps } from "../networking/types";
import { CallExecutionError, MissingArgumentsError } from "../errors";
import { DataFormat, Model } from "../data/model";
import { Executor, State, Stream } from "./index";
import { ExecutorState } from "./state";

/**
 * Abstract Callable class with generic processing functionalities
 */
export class Callable<
  T extends Model | Model[] | String | String[] | string | string[] | Blob | Blob[] | NONE
> extends Stream<T> {
  /**
   * Type of response body expected from the callback's Response Object
   * @protected
   */
  protected readonly responseType?: ResponseType;

  /**
   * Model used to deserialize response object retrieved from the network request
   * @protected
   */
  protected readonly ModelClass?: typeof Model | typeof String;

  /**
   * Used to check if the response is expected to be an array of ModelClass
   * @protected
   */
  protected readonly arrayResponseSupport: boolean;

  protected constructor(
    executor: Executor,
    ModelClass?: typeof Model | typeof String,
    responseType?: ResponseType,
    arrayResponse = false
  ) {
    super(((v) => {
      const result = executor(v);
      if (result instanceof Promise) return result.then((v) => new ExecutorState(true, v));
      return new ExecutorState(true, result);
    }) as unknown as Executor);
    if (ModelClass != null && responseType === undefined) {
      throw new MissingArgumentsError(["responseType"]);
    }
    if (responseType != null && ModelClass === undefined && responseType !== ResponseType.BINARY) {
      throw new MissingArgumentsError(["responseType"]);
    }

    this.ModelClass = ModelClass;
    this.responseType = responseType;
    this.arrayResponseSupport = arrayResponse;
  }

  /**
   * Converts json object to a Model instance/Array of Models
   * @param json json object
   * @param resp optional Response object
   * @protected
   */
  protected async __process_json__(json: Object | Object[], resp?: Response): Promise<T> {
    if (this.ModelClass?.name === String.name) {
      throw new CallExecutionError("Invalid decorator combination. Cannot use String model with JSON formatting", resp);
    }
    const Class = this.ModelClass as typeof Model;

    if ((json instanceof Array || Array.isArray(json)) && this.arrayResponseSupport) {
      return json.map((v) => Class.fromJSON<any>(v)) as T;
    } else if (!(json instanceof Array || Array.isArray(json)) && !this.arrayResponseSupport) {
      return Class.fromJSON<any>(json);
    }

    throw new CallExecutionError("Invalid data format received", resp);
  }

  /**
   * Processes the response body to appropriate return type for a Callable
   * @param resp response object
   * @param responseType ResponseType
   * @protected
   */
  protected async __process_response__(resp: Response, responseType?: ResponseType): Promise<T> {
    switch (responseType) {
      case ResponseType.JSON: {
        const result = await resp.json();
        return await this.__process_json__(result, resp);
      }
      case ResponseType.STRING: {
        const result = await resp.text();
        return String(result) as unknown as T;
      }
      case ResponseType.XML: {
        if (this.ModelClass?.name === String.name) {
          throw new CallExecutionError(
            "Invalid decorator combination. Cannot use String model with JSON formatting",
            resp
          );
        }
        const Class = this.ModelClass as typeof Model;
        return Class.fromString<any>(await resp.text(), DataFormat.XML);
      }
      case ResponseType.BINARY: {
        return (await resp.blob()) as T;
      }
      default:
        return null as T;
    }
  }
}

/**
 * A Callable structure for executing single network request
 */
export class Call<T extends Model | Model[] | String | string | string[] | Blob | NONE> extends Callable<T> {
  /**
   * Callback function to do post-processing once network request has successfully completed
   * @private
   */
  protected readonly callback?: Function;

  /**
   * Throttle configuration for the call
   * @private
   */
  protected readonly throttle?: ThrottleByProps;

  /**
   * Checks if the callable is currently executing
   * @private
   */
  private executingCallback: boolean;

  constructor(
    executor: Executor,
    callback?: Function,
    ModelClass?: typeof Model | typeof String,
    throttle?: ThrottleByProps,
    responseType?: ResponseType,
    arrayResponse = false
  ) {
    super(executor, ModelClass, responseType, arrayResponse);
    this.callback = callback;
    this.throttle = throttle;
    this.executingCallback = false;
  }

  public clone(): Call<T> {
    const newStream = new Call<T>(
      this.executor,
      this.callback,
      this.ModelClass,
      this.throttle,
      this.responseType,
      this.arrayResponseSupport
    );
    newStream.executor = this.executor;
    newStream.actions = [...this.actions];
    newStream.executed = this.executed;
    newStream.done = this.done;
    newStream.backlog = [...this.backlog];
    return newStream;
  }

  public async execute(rawResponse = false): Promise<T> {
    if (this.throttle && this.executingCallback) this.cancel();
    this.executingCallback = true;

    if (this.throttle?.waitPeriodInMs) {
      await new Promise((resolve) => setTimeout(resolve, this.throttle?.waitPeriodInMs));
    }
    const resp = (await super.execute()) as unknown as Response;
    this.executingCallback = false;

    if (!resp) return resp;
    if (!(resp instanceof Response)) return resp;
    if (!resp.ok) {
      throw new CallExecutionError(`Received response status code of ${resp.status}`, resp);
    }
    const response = rawResponse
      ? ((await resp.blob()) as T)
      : await this.__process_response__(resp, this.responseType);
    let callbackResponse = this.callback?.bind({ context: response })();
    if (callbackResponse instanceof Promise) {
      callbackResponse = await callbackResponse;
    } else if (callbackResponse instanceof Callable) {
      callbackResponse = await callbackResponse.execute();
    }
    if (callbackResponse) return callbackResponse as T;
    return response;
  }

  protected async __execute__(): Promise<{ state: State; value?: T }> {
    const preprocessor = (v) => (v instanceof Response ? this.__process_response__(v, this.responseType) : v);
    return await super.__execute__(preprocessor as any);
  }
}
