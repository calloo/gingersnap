# Decoders

Decoders are used to process incoming data to a given format, and is heavily used in the networking section of gingersnap

```ts
interface Decoder<T> {
  decode: (data: ArrayBuffer) => T;
  load?: () => void;
}
```

Gingersnap provides 3 default decoders (**StringDecoder, JSONDecoder and MsgpackDecoder**), but you can create your own as long as it implements the Decoder interface.
```ts
import { StringDecoder, JSONDecoder, MsgpackDecoder } from 'gingersnap/data/decoders';

const stringDecoder = new StringDecoder();

// data as arrayBuffer must be provided and will be converted to String
stringDecoder.decode(...);

const jsonDecoder = new JSONDecoder();
// data as arrayBuffer must be provided and will be converted to json object
jsonDecoder.decode(...);

const packDecoder = new MsgpackDecoder();

// data as arrayBuffer must be provided and will be converted to json object
packDecoder.decode(...);
```