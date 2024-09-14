import { PersistenceStore } from "./manager";
import { Files } from "../../files";
import { Future } from "../../future";
import { Stream } from "../../stream";

export class JSONFileStore implements PersistenceStore {
  constructor(private readonly filename: string) {}

  close(): Future<void> {
    return Future.completed(null);
  }

  open(): Future<void> {
    return Future.completed(null);
  }

  clear(): Future<void> {
    return Files.remove(this.filename);
  }

  get(key: string): Future<string | undefined> {
    return this.loadJSONData().thenApply(({ value }) => value[key] as string | undefined);
  }

  keys(): Stream<string> {
    return this.loadJSONData()
      .thenApply(({ value }) => Object.keys(value))
      .stream.flatten();
  }

  length(): Future<number> {
    return this.loadJSONData().thenApply(({ value }) => Object.keys(value).length);
  }

  remove(key: string): Future<void> {
    return this.loadJSONData().thenApply(({ value }) => {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete value[key];
      return this.saveJSONData(value);
    });
  }

  set(key: string, value: string): Future<void> {
    return this.loadJSONData().thenApply(({ value: data }) => {
      data[key] = value;
      return this.saveJSONData(data);
    });
  }

  values(): Stream<string> {
    return this.loadJSONData()
      .thenApply(({ value }) => Object.values(value as { [string: string]: string }))
      .stream.flatten();
  }

  private loadJSONData() {
    return Files.readString(this.filename).thenApply(({ value }) => (value ? JSON.parse(value) : {}));
  }

  private saveJSONData(data: any) {
    return Files.write(JSON.stringify(data), this.filename);
  }
}
