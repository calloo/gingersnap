import { PersistenceStore } from "./manager";
import { Future } from "../../future";
import { Stream } from "../../stream";
import { ExecutorState } from "../../stream/state";

export class LocalWebStore implements PersistenceStore {
  close(): Future<void> {
    return Future.completed(null);
  }

  open(): Future<void> {
    return Future.completed(null);
  }

  clear(): Future<void> {
    return undefined;
  }

  get(key: string): Future<string | undefined> {
    return Future.of((resolve) => resolve(localStorage.getItem(key)));
  }

  keys(): Stream<string> {
    let index = -1;
    return new Stream(() => {
      if (++index >= localStorage.length) {
        return new ExecutorState(true);
      }
      return localStorage.key(index);
    });
  }

  length(): Future<number> {
    return Future.of((resolve) => resolve(localStorage.length));
  }

  remove(key: string): Future<void> {
    return Future.of((resolve) => {
      localStorage.removeItem(key);
      resolve();
    });
  }

  set(key: string, value: string): Future<void> {
    return Future.of((resolve) => {
      localStorage.setItem(key, value);
      resolve();
    });
  }

  values(): Stream<string> {
    return this.keys().map((key) => localStorage.getItem(key));
  }
}

export class SessionWebStore implements PersistenceStore {
  close(): Future<void> {
    return Future.completed(null);
  }

  open(): Future<void> {
    return Future.completed(null);
  }

  clear(): Future<void> {
    return undefined;
  }

  get(key: string): Future<string | undefined> {
    return Future.of((resolve) => resolve(sessionStorage.getItem(key)));
  }

  keys(): Stream<string> {
    let index = -1;
    return new Stream(() => {
      if (++index >= sessionStorage.length) {
        return new ExecutorState(true);
      }
      return sessionStorage.key(index);
    });
  }

  length(): Future<number> {
    return Future.of((resolve) => resolve(sessionStorage.length));
  }

  remove(key: string): Future<void> {
    return Future.of((resolve) => {
      sessionStorage.removeItem(key);
      resolve();
    });
  }

  set(key: string, value: string): Future<void> {
    return Future.of((resolve) => {
      sessionStorage.setItem(key, value);
      resolve();
    });
  }

  values(): Stream<string> {
    return this.keys().map((key) => sessionStorage.getItem(key));
  }
}
