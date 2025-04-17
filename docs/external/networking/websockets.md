# Streamable WebSockets

The current WebSocket client that's available for browsers can be difficult to use, as it heavily relies on the callback approach

```ts
const socket = new WebSocket("ws://localhost:8000");

socket.addEventListener("open", (event) => {
  socket.send("Hello world!");
});

socket.addEventListener("message", (event) => {
  console.log("Message from server ", event.data);
});
```

Hence we provide **StreamableWebSocket** which allows you to streams and futures for communicating with a server

```ts
import { StreamableWebSocket } from 'gingersnap/socket';
import { StringDecoder } from 'gingersnap/data/decoders';

const socket = new StreamableWebSocket("ws://localhost:8000", new StringDecoder());

socket.open().thenApply(() => {
  socket.sendNow("Hello world!");
  
  // all messages received before calling stream() will not be available
  socket.stream().forEach(message => {
    console.log(`Message from server ${message}`);
  });
}).finally(() => {
  socket.close();
});
```

The StreamableWebSocket takes the url and a [decoder](/data/decoders) which will be used to decode the incoming data. 
There are other optional configurations that can be passed such as a **WebSocketConfiguration** object and the **maxReconnectAttempt** (defaults to 3)

```ts
interface WebSocketConfiguration {
  retryOnDisconnect?: boolean; // should we retry if disconnected from server defaults to true
  cacheSize?: number; // max buffer size to use for message streams defaults to 1000
  cacheExpiryPeriod?: WaitPeriod; // how long should we buffer each message for. default to no expiration
  exponentialFactor?: number; // used in reconnection defaults to 2
  backoffPeriodMs?: number; // used in reconnection defaults to 10
}
```

In the previous example, if messages were sent before calling **stream()** then those messages would have been dropped. 
To avoid missing data, you can use the **with** function as StreamableWebSocket implements the ContextManager interface


```ts
import { StreamableWebSocket } from 'gingersnap/socket';
import { StringDecoder } from 'gingersnap/data/decoders';

const socket = new StreamableWebSocket("ws://localhost:8000", new StringDecoder(), {cacheSize: 10_000});

// context manager handles opening and closing the socket
socket.with(result => {
  // with provides a FutureResult<Stream<T>>
  const stream = result.value;
  socket.sendNow("Hello world!");

  // all messages up to cacheSize of 10,0000 will be available before this call
  stream.forEach(message => {
    console.log(`Message from server ${message}`);
  });
})
```