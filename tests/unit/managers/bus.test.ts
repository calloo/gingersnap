import { Future } from "../../../src/future";
import { DataBus } from "../../../src/data/bus";
import { Collectors } from "../../../src/stream/collector";

describe("DataBus", () => {
  let bus: DataBus;

  beforeEach(() => {
    bus = new DataBus<string>();
  });

  it("should dispatch message to specific topic", async () => {
    const jobObserver = bus.connectConsumer("jobs");
    const response = jobObserver
      .subscribe("testing")
      .map((v) => v.data)
      .execute();

    await Future.sleep({ milliseconds: 100 });
    bus.publish("jobs.testing", "message");
    expect(await response).toEqual("message");
  });

  it("should broadcast message to all connectors", async () => {
    const jobObserver = bus.connectConsumer("jobs");
    const reportObserver = bus.connectConsumer("reports");
    const foodObserver = bus.connectConsumer("foods");
    const response1 = jobObserver
      .subscribe("testing")
      .map((v) => v.data)
      .take(2)
      .collect(Collectors.asList())
      .schedule();
    const response2 = reportObserver
      .subscribe("testing")
      .map((v) => v.data)
      .take(3)
      .collect(Collectors.asList())
      .schedule();
    const response3 = foodObserver
      .subscribe("*")
      .map((v) => v.data)
      .take(3)
      .collect(Collectors.asList())
      .schedule();

    await Future.sleep({ seconds: 1 });
    bus.publish("*.testing", "message");
    bus.publish("[jobs, reports, foods].testing", "message2");
    bus.publish("[reports,foods].testing", "message3");
    expect(await response1).toEqual(["message", "message2"]);
    expect(await response2).toEqual(["message", "message2", "message3"]);
    expect(await response3).toEqual(["message", "message2", "message3"]);
  });

  it("should accept incoming messages from consumers", async () => {
    const jobObserver = bus.connectConsumer("jobs");
    const reportObserver = bus.connectConsumer("reports");
    const response = bus
      .subscribe("*.testing")
      .map((v) => v.data)
      .take(2)
      .collect(Collectors.asList())
      .schedule();
    const response2 = bus
      .subscribe("[jobs,reports].testing")
      .map((v) => v.data)
      .take(2)
      .collect(Collectors.asList())
      .schedule();
    const response3 = bus
      .subscribe("jobs.testing")
      .map((v) => v.data)
      .execute();

    await Future.sleep({ milliseconds: 100 });
    jobObserver.publish("testing", "message");
    reportObserver.publish("testing", "message");
    expect(await response).toEqual(["message", "message"]);
    expect(await response2).toEqual(["message", "message"]);
    expect(await response3).toEqual("message");
  });
});
