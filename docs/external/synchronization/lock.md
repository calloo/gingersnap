# Preventing race conditions

Locks are sometimes a neccessary evil when you need to protect a resource from being accessed incorrectly. It's main use is to prevent race condition, which can also happen in a single-threaded event such as JavaScript. Gingersnap provides the **Lock** class that allows you to acquire and release the lock.

There are numerous ways to use the lock, in the examples below you can either:
1. Manually acquire and release the lock
2. Chain the acquiring and releasing of the lock as a Future
3. Given a lock implements the ContextManager interface, you can use the 'with' method to place code that should only execute when the lock is acquired, and the lock is released upon exiting the with block

```ts
import {Lock} from "gingersnap/synchronize";
import {Future} from "gingersnap/future";

async function myTask1(lock: Lock) {
    await lock.acquire() // wait to acquire the lock
    console.log('Lock acquired. myTask1 Performing task on shared resource..')
    await Future.sleep({milliseconds: 500})
    lock.release()
}

async function myTask2(lock: Lock) {
    // wait at most 300 millisecond to acquire lock otherwise throw TimeoutError
    await lock.acquire({milliseconds: 300})
    console.log('Lock acquired. myTask2 Performing task on shared resource..')
    await Future.sleep({seconds: 2})
    lock.release()
}

// myTask3 returns Future<void> by chaining the lock acquiring and freeing the lock in the finally block
const myTask3 = (lock: Lock) => lock.acquire().thenApply((v) => {
    console.log('Lock acquired. myTask3 Performing task on shared resource..')
    return Future.sleep({seconds: 1}, v.signal)
}).finally(() => lock.release())

// myTask4 returns Future<void> by using the ContextManager approach - code inside 'with' block will be executed
// upon acquiring the lock, and the lock will be released once execution finishes
const myTask4 = (lock: Lock) => lock.with(async v => {
    console.log('Lock acquired. myTask4 Performing task on shared resource..')
    await Future.sleep({seconds: 1.5}, v.signal)
});

const lock = new Lock();
Future.collectSettled([
    Future.wrap(myTask1(lock)),
    Future.wrap(myTask1(lock)),
    Future.wrap(myTask2(lock)),
    myTask3(lock),
    myTask3(lock),
    myTask4(lock),
    myTask4(lock),
]).schedule();
```

This outputs
```bash
Lock acquired. myTask1 Performing task on shared resource..
Lock acquired. myTask3 Performing task on shared resource..
Lock acquired. myTask3 Performing task on shared resource..
Lock acquired. myTask4 Performing task on shared resource..
Lock acquired. myTask4 Performing task on shared resource..
Lock acquired. myTask1 Performing task on shared resource..

```

From the output you will notice there is no myTask2, as acquiring the lock failed due to TimeoutError