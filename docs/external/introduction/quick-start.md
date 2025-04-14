# Getting Started

This section will quickly carry you through the core features that will help you build a basic service layer for your web application. By the end of this
tutorial, you will understand how to use gingersnap to:
- modelling data
- sending and receiving messages via HTTP/S

---

## Step 1: Project Setup

Install gingersnap and create a vite project

::: code-group
```bash [npm]
npm install --save gingersnap
npm create vite@latest my-gingersnap
npm i -D vite-plugin-swc-transform
```

```bash [npm]
yarn install --save gingersnap
yarn create vite@latest my-gingersnap
yarn i -D vite-plugin-swc-transform
```

```bash [pnpm]
pnpm install --save gingersnap
pnpm create vite@latest my-gingersnap
pnpm i -D vite-plugin-swc-transform
```
:::

Open **my-gingersnap** project in your favor text editor. Update tsconfig.json to support TS decorators
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,

    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,

    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": [
    "src"
  ]
}
```

Create a vite config to use plugin that will support TS decorators
```js
import {defineConfig} from "vite";
import swc from "vite-plugin-swc-transform";

export default defineConfig({
    plugins: [
        swc({
            swcOptions: {
                jsc: {
                    target: "ES2021",
                    transform: {
                        legacyDecorator: true,
                        decoratorMetadata: true,
                    },
                },
            },
        }),
    ],
});
```

## Step 2: Setup Data Model
We will be building a service layer to handle reading blog posts from a fake JSON Rest API 
(https://jsonplaceholder.typicode.com/posts). Before we make any network request, we need to model the data.

### Why model data?
We model the data that we expect to receive from the API to provide data validation. If the data does not match what
we expect, an error will be thrown. This is the best approach as it prevents having unexpected missing data, that 
propagate throughout your User Interface. It also acts as a safeguard for using services that may introduce 
breaking changes in the same API version.

### Building Model
We need to model the following JSON data format that we expect to receive
```json
{
  "id": 1,
  "userId": 1,
  "title": "sunt aut facere repellat provident occaecati excepturi optio reprehenderit",
  "body": 	"quia et suscipit\nsuscipit recusandae consequuntur expedita et cum\nreprehenderit molestiae ut ut quas totam\nnostrum rerum est autem sunt rem eveniet architecto"
}
```

To create a model, we need to extend the Model class. Each property that we expect a post to contain, should
be a **Field** in the model. To create a field, we need to define a property on the class, with the **@Field**
decorator.

```ts
// src/post.model.ts
import { Field, Model } from "gingersnap/data/model";

export class Post extends Model {
    @Field() // maps the "id" field in the post JSON data to the id property
    id: number;
    
    @Field("userId") // maps the "userId" field in the post JSON data to the user property
    user: number;
    
    @Field() // maps the "title" field in the post JSON data to the title property
    title: string;
    
    @Field() // maps the "body" field in the post JSON data to the body property
    body: string;
}
```

You can manually convert JSON to models by invoking the static method **fromJSON**. This will run validations and if any
field is missing will throw an error

```ts
//// testing model

// works
const post1: Post = Post.fromJSON({
  "id": 1,
  "userId": 1,
  "title": "sunt aut facere repellat...",
  "body": 	"quia et suscipit\nsuscipit ..."
})

// will throw an error as title and body is missing
const post2: Post = Post.fromJSON({
  "id": 1,
  "userId": 1,
})
```

## Step 3: Setup Network Service
To communicate with https://jsonplaceholder.typicode.com, we need to send a network request. A network service is 
responsible for providing the logic for network I/O operation based on descriptive annotations

```ts
// src/post.service.ts
import {
  PASS,
  JSONResponse, 
  GET,
  NetworkService,
} from "gingersnap/networking";
import { Stream } from "gingersnap/stream";
import { Post } from "./post.model";

export class PostService extends NetworkService {
  @JSONResponse({ modelType: Post, isArray: true }) // accept JSON response and convert it to Post instance
  @GET("/posts") // sends a GET reques to path /posts
  getPosts(): Stream<Post[]> { // returns a stream that produces Post instances
    return PASS; // placeholder to suppress typescript warnings, as the logic is described not implemented
  }
}
```

Retrieving the posts is handled by the **getPosts** method. With gingersnap, all you need to do is describe
what the method should do, hence the body is empty. **return PASS** is used to suppress typescript warnings that the
method is empty.
The return type of **Stream\<Post\>** is a Streamable object. A stream represents a flow of continuous data from a source


## Step 4: Tie it all together
We need to create an instance of the PostService. For this, we need to create a
**GingerSnap** object, which is responsible for building services.**snap.create(PostService, {baseUrl: '...'})**
call creates the service and sets the baseUrl to https://jsonplaceholder.typicode.com.
```ts
// src/main.ts
import { GingerSnap } from "gingersnap/networking";
import { PostService } from "./post.service";

async function main() {
    const snap = new GingerSnap();
    const postService = snap.create(PostService, {baseUrl: 'https://jsonplaceholder.typicode.com'});
    
    // execute() runs the stream once, and retrieves only one result
    // given REST API GET call only gives one result, only need to read from stream once
    const posts = await postService.getPosts().execute();
    console.log('Received the following posts..');
    posts.forEach(post => {
        const tag = document.createElement('p');
        tag.innerHTML = `<p>${post.id}. Title - ${post.title} Body - ${post.body}</p>`;
       document.body.append(tag)
    });
}

main();
```
