# Streams - Process data in chain

A Stream represents an eventual flow of data from 1 or more asynchronous operations. Streams are useful for processing data in stages.
A stream only needs one function that takes 1 argument, an abort signal, and returns the result of the given execution. This function is invoked everytime
the stream is called, and only stops if the function returns an **ExecutorState** with the status of done being true.

The result returned from a stream can be a Promise, Future, another Stream, ExecutorState, or the actual value to be used. Promises and Futures will be
resolved to the actual value, and Streams will be processed until it ends.

```ts
import { Stream, ExecutorState } from "gingersnap/stream";

let userId = 0;
const postStream = new Stream((signal) => {
  userId++; // increment the user on each call to fetch the next user's posts
  return fetch(`https://jsonplaceholder.typicode.com/posts?userId=${userId}`, { signal })
    .then((resp) => resp.json())
    .then((posts) => {
      if (posts.length === 0) {
        // stream should end now as there is no more data
        return new ExecutorState(true);
      }
      return posts;
    });
});

const getPostsByUser = async () => {
   // you can loop over a stream. Loop will exit when stream has no more data
  for await (let posts of postStream) {
    console.log(`User ${userId} made posts`, posts);
  }
};
getPostsByUser();
```

## Streams from Iterators and Futures
You can also create a stream from any object that implements [Symbol.iterator] (E.g. arrays), async generators, implements [Symbol.asyncIterator] or a 
future.
```ts
import { Stream } from "gingersnap/stream";

// stream from an iterable
for await (let num of Stream.of([1,2,3,4,5])) {
  console.log(num);
}

for await (let num of Stream.of(Future.completed(1))) {
  console.log(num);
}

async function* gen() {
  yield 1;
  yield 2;
  yield 3;
}

for await (let num of Stream.of(gen())) {
  console.log(num);
}
```

## Functional Features

Streams can be chained to add powerful operations. Each chained opeartion does NOT create a new stream (this is for performance reason). If a new stream is
required, the **clone()** method can be used


## Taking few results

```ts
// only print the first 10 results
for await (let posts of postStream.take(10)) {
  console.log(`User ${userId} made posts`, posts);
}
```

## Flatten results
This takes an array result (even nested arrays) and streams individual records
```ts
// only gets one user's posts and streams one post at a time
for await (let post of postStream.take(1).flatten()) {
  console.log(`User 1 made post`, post);
}
```

## Skipping results

// skips the first 5 user's posts, then only take then next 5 user's posts
```ts
for await (let post of postStream.skip(5).take(5).flatten()) {
  console.log(`User ${userId} made post`, post);
}
```

## Filtering results

```ts
const stream = postStream
  .skip(5)
  .flatten()
  .filter((post) => post.body.includes("error"));

for await (let post of stream) {
  console.log(`User ${userId} made post`, post);
}
```

## Transforming results

```ts
const stream = postStream
  .skip(5)
  .flatten()
  .map((post) => `User - ${post.userId}\nTitle - ${post.title}\nBody - ${post.body}`);

for await (let message of stream) {
  console.log(message);
}
```

## Chunking results

Chunking allows you to aggregate the stream into array chunks. In the example below, we are stream an array containing 5 messages at a time. If the stream
ends, the last chunk may have less than the chunk size if not enough data was available
```ts
const stream = postStream
  .flatten()
  .map((post) => `User - ${post.userId}\nTitle - ${post.title}\nBody - ${post.body}`)
  .chunk(5);

for await (let groupedMessages of stream) {
   // groupedMessages contains at most 5 messages
  console.log(groupedMessages.join("\n"));
}
```

## Throttling results
You can delay the call of the stream on each invocation. Useful for not hammering APIs
```ts
const stream = postStream
  .throttleBy({ seconds: 5 })
  .flatten()
  .map((post) => `User - ${post.userId}\nTitle - ${post.title}\nBody - ${post.body}`);

for await (let message of stream) {
  console.log(message);
}
```

## Executing once
You can execute a stream once. This yields a future that can be awaited
```ts
const stream = postStream
  .flatten()
  .map((post) => `User - ${post.userId}\nTitle - ${post.title}\nBody - ${post.body}`);
const stream2 = stream.clone(); // make a clone of the stream

const message1 = await stream.execute();
const message2 = await stream2.future; // similar to statement above
console.log(message1, messsage2);
```

## Executing section of the stream once
There are cases where you want to only execute a section of a stream once, then run the remaining parts of the stream until all data is finished. This can be
done using the **once()** method. Note, this is no different that using **take(1)**
```ts
const stream = postStream.once() // only running for the first user
  .flatten()
  .map((post) => `User - ${post.userId}\nTitle - ${post.title}\nBody - ${post.body}`);

const message = await stream.execute();
console.log(message);
```

## Futures to Stream

Futures can be converted to streams also. But given that futures can only be executed once, this is
similar to creating a stream that yields result once and then ends.
```ts
let userId = 0;
const postStream = Future.wrap(fetch("https://jsonplaceholder.typicode.com/posts"))
  .stream.map((resp) => resp.json());

const getPostsByUser = async () => {
  console.log("Only retrieving user 1 posts");
  const posts = await postStream.execute();
};
getPostsByUser();
```

## Streaming Futures as completed

If you have multiple futures that you are waiting on for results, you can convert them to a stream that yields record as it becomes available.
```ts
const postFuture = Future.wrap(fetch("https://jsonplaceholder.typicode.com/posts"));
const userFuture = Future.wrap(fetch("https://jsonplaceholder.typicode.com/users"));

for await (let record of Stream.asCompleted([postFuture, userFuture])) {
  if (record.username !== undefined) {
    console.log(`Got user ${record}`);
  } else {
    console.log(`Got post ${record}`);
  }
}
```


## Collecting stream
Rather than looping over the stream to store the data in an array, you can collect all of the results into an array.
This method returns a future

```ts
// Post[] - list of all the posts
import { Collectors } from "gingersnap/stream/collector";

const posts = await postStream.flatten().collect(Collectors.asList());
```

## Consuming stream
Similar to .collect, but rather than storing the result of the stream, this loops over the stream until complete. This
method returns a future.
```ts
await postStream.flatten()
  .map((post) => `User - ${post.userId}\nTitle - ${post.title}\nBody - ${post.body}`)
  .map(mesage => console.log(message))
  .consume();
```

## Attaching signals to stream
What if you didn't create the stream, you wouldn't have access to the signal argument passed to listen for cancellation. To solve this issue, you can attach an external signal to a stream that it will listen to for an abort signal.
```ts
await postStream.flatten()
  .map((post) => `User - ${post.userId}\nTitle - ${post.title}\nBody - ${post.body}`)
  .map(mesage => console.log(message))
  .cancelOnSignal(someExternalSignal)
  .consume();
```

## Zipping streams
You can combine the results from more than one streams into one by zipping them together
```ts
let userId = 0;
const todoStream = new Stream((signal) => {
  userId++; // increment the user on each call to fetch the next user's posts
  return fetch(`https://jsonplaceholder.typicode.com/todos?userId=${userId}`, { signal })
    .then((resp) => resp.json())
    .then((todos) => {
      if (todos.length === 0) {
        // stream should end now as there is no more data
        return new ExecutorState(true);
      }
      return posts;
    });
});

await Stream.zip([postStream.flatten(), todoStream.flatten()])
  .map(([post, todo]) => `Post - ${post}\nTodo - ${todo}`)
  .map(mesage => console.log(message))
  .consume();
```

## Merging streams
You can intertwine the results from multiple streams into one. The record streamed is the value that is available
the fastest.
```ts
await Stream.merge([postStream.flatten(), todoStream.flatten()])
  .map((record) => record.body ? `Got Post ${record}`: `Got Todo ${record}`)
  .map(mesage => console.log(message))
  .consume();
```

## Catching Errors
You can catch an error that occurred anywhere upstream, and either handle it or raise another error to kill the stream. Multiple catches can be applied to any stream.
```ts
await Stream.merge([postStream.flatten(), todoStream.flatten()])
  .catch(error => {
    console.error(error);
    return undefined; // undefined is skipped in streams. Thus this suppresses the error
  })
  .map((record) => record.body ? `Got Post ${record}`: `Got Todo ${record}`)
  .map(mesage => console.log(message))
  .consume();
```

## Important Note
undefined is always skipped in streams, with undefined and null values being skipped in the **filter** method.