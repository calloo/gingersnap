import fs, { PathLike } from "fs";
import * as readline from "readline";
import { Stream } from "./stream";
import { Future, WaitPeriod } from "./future";
import { Dirent, Stats } from "node:fs";
import path from "path";
import { BufferEncoding } from "object-hash";
import R from "ramda";
import { Queue } from "./data-structures/object";

interface FileWatchOptions {
  encoding: BufferEncoding;
  objectMaxSize?: number;
  expiryPeriod?: WaitPeriod;
}

export class Files {
  static watch(source: PathLike, { objectMaxSize, expiryPeriod }: Omit<FileWatchOptions, "encoding">) {
    return Files.watchData<string>(source, { objectMaxSize, expiryPeriod, encoding: "utf-8" });
  }

  static watchBinary(source: PathLike, { objectMaxSize, expiryPeriod }: Omit<FileWatchOptions, "encoding">) {
    return Files.watchData<Buffer>(source, { objectMaxSize, expiryPeriod, encoding: "binary" });
  }

  static removeDirectories(source: PathLike) {
    return Future.of<void>((resolve, reject) => {
      fs.rm(source, { recursive: true, force: true }, (error) => (error ? reject(error) : resolve()));
    });
  }

  static remove(source: PathLike) {
    return Future.of<void>((resolve, reject) => {
      fs.rm(source, (error) => (error ? reject(error) : resolve()));
    });
  }

  static createDirectories(path: PathLike): Future<void> {
    return Future.of((resolve, reject) => {
      fs.mkdir(path, { recursive: true }, (error) => (error ? reject(error) : resolve()));
    });
  }

  static list(path: PathLike) {
    return Future.of<Dirent[]>((resolve, reject, signal) => {
      fs.readdir(path, { withFileTypes: true }, (error, files) => (error ? reject(error) : resolve(files)));
    });
  }

  static move(source: string, dest: string, concurrencyLimit: number = 10): Future<void> {
    return Files.stat(source).thenApply(({ value }) => {
      if (value.isFile()) {
        return Future.of<void>((resolve, reject) =>
          fs.rename(source, dest, (error) => (error ? reject(error) : resolve()))
        );
      }
      return Files.list(source)
        .stream.flatten()
        .parallel(concurrencyLimit)
        .map((stat) => {
          const oldPath = path.join(source, stat.name);
          const newPath = path.join(dest, stat.name);

          if (stat.isDirectory()) {
            return Files.move(oldPath, dest);
          } else if (stat.isFile()) {
            return Future.of((resolve, reject) =>
              fs.rename(oldPath, newPath, (error) => (error ? reject(error) : resolve(null)))
            );
          }

          return null;
        })
        .consume();
    });
  }

  static stat(source: PathLike) {
    return Future.of<Stats>((resolve, reject, signal) => {
      fs.stat(source, (error, stat) => (error ? reject(error) : resolve(stat)));
    });
  }

  static lines(source: PathLike, encoding: BufferEncoding = "utf-8"): Stream<string> {
    let shutdownHook: () => void = () => {};
    return Stream.seed(() => {
      const fileStream = fs.createReadStream(source, encoding);

      const reader = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });
      shutdownHook = () => {
        reader.close();
        fileStream.close();
      };
      return Stream.of(reader[Symbol.asyncIterator]());
    }).onCompletion(() => shutdownHook());
  }

  static readNBytes(source: PathLike, bufferSize: number) {
    return Files.read(source, bufferSize).execute();
  }

  static read(source: PathLike, bufferSize: number = 100): Stream<Buffer> {
    let shutdownHook: () => void = () => {};
    return Stream.seed(() => {
      return Future.of<number>((resolve, reject) => {
        fs.open(source, "rb", function (error, fd) {
          shutdownHook = () => fs.close(fd);
          if (error) {
            return reject(error);
          }
          resolve(fd);
        });
      }).stream.map((fd) =>
        Future.of<Buffer>((resolve, reject, signal) => {
          const buffer = Buffer.alloc(bufferSize);
          fs.read(fd, buffer, 0, bufferSize, 0, function (error, num) {
            if (signal.aborted) {
              fs.close(fd, (err) => (err ? reject(err) : null));
              shutdownHook = () => {};
            } else if (error) {
              reject(error);
            } else {
              resolve(buffer);
            }
          });
        })
      );
    }).onCompletion(() => shutdownHook());
  }

  static readString(source: PathLike): Future<string> {
    return Files.readAll(source, "utf-8") as Future<string>;
  }

  static readAll(source: PathLike, encoding: BufferEncoding | null = null) {
    return Future.of<string | Buffer>((resolve, reject, signal) => {
      fs.readFile(source, { encoding, signal }, (error, data) => {
        if (error) {
          reject(error);
        } else {
          resolve(data);
        }
      });
    });
  }

  write(
    data: string | NodeJS.ArrayBufferView | Stream<string | NodeJS.ArrayBufferView>,
    source: PathLike,
    encoding: BufferEncoding = "utf-8"
  ): Future<void> {
    if (data instanceof Stream) {
      return Files.writeFromStream(data, source, encoding);
    }
    return Future.of((resolve, reject, signal) => {
      fs.writeFile(source, data, { encoding, signal }, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  private static writeFromStream<T>(
    stream: Stream<T>,
    source: PathLike,
    encoding: BufferEncoding = "utf-8"
  ): Future<void> {
    return Future.of(async (resolve, reject, signal) => {
      const fileStream = fs.createWriteStream(source, encoding);
      await stream
        .map((v) =>
          Future.of((resolve, reject) => {
            if (
              !fileStream.write(v, (error) => {
                if (error) {
                  fileStream.close();
                  reject(error);
                }
              })
            ) {
              fileStream.once("drain", resolve);
            } else {
              resolve(null);
            }
          })
        )
        .onCompletion(() => {
          fileStream.close();
        })
        .cancelOnSignal(signal)
        .consume();
    });
  }

  private static watchData<T>(source: PathLike, { objectMaxSize, expiryPeriod, encoding }: FileWatchOptions) {
    const getQueue = R.once((signal: AbortSignal) => {
      const queue = new Queue<T>(objectMaxSize, expiryPeriod);
      fs.watch(source, { recursive: true, persistent: true, signal, encoding }, (v) => queue.enqueue(v as T));
      return queue;
    });
    return new Stream<T>((signal) => {
      const queue = getQueue(signal);
      return queue.awaitDequeue(signal);
    });
  }
}
