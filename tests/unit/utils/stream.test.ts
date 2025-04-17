import { Stream } from "../../../src/stream";
import userData from "../../data/users.json";
import * as R from "ramda";
import { Collectors } from "../../../src/stream/collector";
import { Future } from "../../../src/future";
import { FutureEvent } from "../../../src/synchronize";
import { TimeoutError } from "../../../src/errors";

interface Name {
  firstName: string;
  lastName: string;
}

describe("Stream", () => {
  it("should bulk transform data", async () => {
    const result = await Stream.of(userData.users)
      .map(R.pick(["firstName", "lastName"]) as (v: any) => Name)
      .map((v: Name) => v.firstName + " " + v.lastName)
      .chunk(2)
      .map((users) => users[0] + " and " + users[1])
      .skip(4)
      .filter(R.complement(R.includes("Price")))
      .chunk(2)
      .flatten()
      .take(2)
      .collect(Collectors.asList());
    expect(result).toEqual(["Marcel Jones and Assunta Rath", "Trace Douglas and Enoch Lynch"]);
  });
  it("should conflate results", async () => {
    const recordGen = async function* () {
      yield 1;
      await Future.sleep({ milliseconds: 100 });
      yield 2;
      yield 3;
    };
    const results = await Stream.of(recordGen())
      .conflate()
      .map((v) => Future.sleep({ milliseconds: 300 }).thenApply(() => v))
      .collect(Collectors.asList());
    expect(results).toEqual([1, 3]);
  });

  it("should buffer results", async () => {
    const evt = new FutureEvent();
    const recordGen = async function* () {
      yield 1;
      await Future.sleep({ milliseconds: 100 });
      yield 2;
      yield 3;
      evt.set();
    };
    const stream = Stream.of(recordGen())
      .buffer()
      .map((v) => Future.sleep({ milliseconds: 200 }).thenApply(() => v))
      .collect(Collectors.asList());

    const firstDone = await Future.firstCompleted([stream, evt.wait()]);
    expect(firstDone).toEqual(evt);
    const results = await stream;
    expect(results).toEqual([1, 2, 3]);
  });

  it("should wait for first upstream data", async () => {
    const stream = Future.sleep({ seconds: 1 }).thenApply(() => 5).stream;
    const result = stream.waitFirstFor({ milliseconds: 100 }).head().future;
    await expect(result).rejects.toEqual(new TimeoutError());

    const stream2 = Future.sleep({ seconds: 1 }).thenApply(() => 5).stream;
    const result2 = stream2.waitFirstFor({ seconds: 2 }).head().future;
    await expect(result2).resolves.toEqual(5);
  });

  it("should wait for all upstream data", async () => {
    const stream = Stream.merge([
      Future.sleep({ seconds: 1 }).thenApply(() => 5).stream,
      Future.sleep({ milliseconds: 100 }).thenApply(() => 15).stream,
    ]);
    const result = stream.waitFor({ milliseconds: 200 }).collect(Collectors.asList());
    await expect(result).rejects.toEqual(new TimeoutError());

    const stream2 = Stream.merge([
      Future.sleep({ milliseconds: 110 }).thenApply(() => 5).stream,
      Future.sleep({ milliseconds: 100 }).thenApply(() => 15).stream,
    ]);
    const result2 = stream2.waitFor({ milliseconds: 200 }).collect(Collectors.asList());
    await expect(result2).resolves.toEqual([15, 5]);
  });
});
