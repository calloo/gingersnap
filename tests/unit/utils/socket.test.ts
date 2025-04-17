import { StreamableWebSocket } from "../../../src/socket";
import { NetworkError } from "../../../src/errors";
import { HTTPStatus } from "../../../src/networking";
import { Future } from "../../../src/future";
import { Collectors } from "../../../src/stream/collector";
import { Client, Server } from "mock-socket";
import { v4 as uuid } from "uuid";

describe("Browser WebSocket", function () {
  it("should nothing", () => {});
  const blobDecoder = { decode: (v) => new Blob([v]) };

  it("should establish connection", async () => {
    const url = `ws://${uuid()}.localhost.com`;
    const server = new Server(url);
    let connected = false;
    let closed = false;
    server.on("connection", () => (connected = true));
    server.on("close", () => {
      closed = true;
    });

    const socket = new StreamableWebSocket(url, blobDecoder, { retryOnDisconnect: false });
    await Promise.race([socket.open(), Future.sleep({ seconds: 120 })]).then(() => {
      expect(connected).toBeTruthy();
    });

    socket.close();
    await Future.waitFor(socket.closedFuture(), 1);
    await Future.sleep(1);
    expect(socket.closed).toBeTruthy();
    expect(closed).toBeTruthy();
  });

  it("should send messages", async () => {
    const url = `ws://${uuid()}.localhost.com`;
    const server = new Server(url);
    const socket = new StreamableWebSocket(url, blobDecoder, { retryOnDisconnect: false });
    const connFut = Future.of<Client>((resolve) => server.on("connection", resolve)).schedule();
    await Future.waitFor(socket.open(), { seconds: 1 });
    const conn = await connFut;
    const msgFut = Future.of<string | Blob | ArrayBuffer | ArrayBufferView>((resolve) =>
      conn.on("message", resolve)
    ).schedule();
    await socket.send("Hello");
    await Promise.race([msgFut, Future.sleep({ seconds: 1 })]).then((result) => {
      expect(result).toEqual("Hello");
    });
    socket.close();
  });

  it("should receive messages", async () => {
    const url = `ws://${uuid()}.localhost.com`;
    const server = new Server(url);
    const socket = new StreamableWebSocket<Blob>(url, blobDecoder, { retryOnDisconnect: false });
    const testMessages = ["Hello", "World", "Testing"];

    const connFut = Future.of<Client>((resolve) => server.on("connection", resolve)).schedule();
    await Future.waitFor(socket.open(), { seconds: 1 });
    const conn = await connFut;
    const responseFut = socket
      .stream()
      .map((v) => v.text())
      .take(testMessages.length)
      .collect(Collectors.asList());
    testMessages.forEach((message) => conn.send(message));
    const responseMessage = await responseFut;

    expect(responseMessage).toEqual(testMessages);
    socket.close();
  });

  it("should close stream once socket closed", async () => {
    const url = `ws://${uuid()}.localhost.com`;
    const server = new Server(url);
    const socket = new StreamableWebSocket<Blob>(url, blobDecoder, { retryOnDisconnect: false });
    const testMessages = ["Hello", "World", "Testing"];

    const connFut = Future.of<Client>((resolve) => server.on("connection", resolve)).schedule();
    await Future.waitFor(socket.open(), { seconds: 1 });
    const conn = await connFut;
    const respFut = socket
      .stream()
      .map(async (v) => await v.text())
      .collect(Collectors.asList());
    testMessages.forEach((message) => conn.send(message));

    Future.sleep({ seconds: 1 })
      .thenApply(() => socket.close())
      .schedule();
    const responseMessage = await respFut;

    expect(responseMessage).toEqual(testMessages);
    socket.close();
  });

  it("should attempt to retry connection", async () => {
    const url = `ws://localhost.com`;
    const socket = new StreamableWebSocket<Blob>(url, blobDecoder);
    socket.open().schedule();
    await Future.sleep({ seconds: 1 });
    expect(socket.opened).toBeFalsy();
    const server = new Server(url);
    try {
      await Future.waitFor(socket.open(), { seconds: 1 });
      expect(socket.opened).toBeTruthy();
    } finally {
      server.close();
    }
  });

  it("should fail to connect", async () => {
    const socket = new StreamableWebSocket<Blob>(`ws://work.localhost.com`, blobDecoder, {
      retryOnDisconnect: false,
    });
    await expect(Future.waitFor(socket.open(), { seconds: 4 }).run()).rejects.toEqual(
      new NetworkError(HTTPStatus.EXPECTATION_FAILED)
    );
  });
});
