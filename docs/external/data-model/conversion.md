# Data conversion

We have described models on the previous page, but how do you convert from source to models, and from models back to 
source?. This is usually abstracted away by the **Service** class, but there maybe cases where you need to use models
outside a service. Here we will explain how to handle data conversion directly.

## Creating the Model

Let's say we have a user profile page, which consist of the profile picture and a link to the bio. The model is as
described below.

```ts
// src/profile.model.ts
import { Field, Model } from "gingersnap/data/model";

export class UserProfile extends Model {
    @Field() 
    profilePicture!: string;
    
    @Field() 
    bioLink!: string;
}

export class UserProfilePage extends Model {
  @Field() 
  profile!: UserProfile;
}
```

We will be converting to and from the **UserProfilePage** model using the methods provided to us from the **Model** class.

## Loading Model from JSON Object or String

You can create a new Model from a JSON Object or a JSON string using the static method **fromJSON** and **fromString**
respectively.
```ts
// src/main.ts
import { UserProfilePage } from "./profile.model";

function main() {
    const profile: UserProfilePage = UserProfilePage.fromJSON({
        profile: {
            profilePicture: 'https://example.site.com/user/1/photo/profile.png',
            bioLink: 'https://example.site.com/user/1/bio.html'
        }
    });

    const profile2: UserProfilePage = UserProfilePage.fromString(`
    {
        "profile": {
            "profilePicture": "https://example.site.com/user/1/photo/profile.png",
            "bioLink": "https://example.site.com/user/1/bio.html"
        }
    }
    `);
}

main();
```
The data will be validated accordingly, and if you pass invalid data, it will throw an error
```ts
// src/main.ts
import { UserProfilePage } from "./profile.model";

function main() {
    // will throw an error as the bioLink field is missing
    const profile: UserProfilePage = UserProfilePage.fromJSON({
        profile: {
            profilePicture: 'https://example.site.com/user/1/photo/profile.png', // [!code error]
        }
    });
}

main();
```

You can also construct from XML string by passing the [Data Format](https://cookienerd-frameworks.gitlab.io/gingersnap/internal/classes/annotations_model_model.Model.html#fromString)
```ts
// src/main.ts
import { UserProfilePage } from "./profile.model";
import {DataFormat} from "gingersnap/data/model";

function main() {
    const profile: UserProfilePage = UserProfilePage.fromString(`
          <?xml version="1.0" encoding="ISO-8859-1" ?>
          <profile>
            <profilePicture>https://example.site.com/user/1/photo/profile.png</profilePicture>
            <bioLink>https://example.site.com/user/1/bio.html</bioLink>
          </profile>
          `, DataFormat.XML);
}

main();
```

## Loading Model from Blob or ArrayBuffer

You can also create a model from a Blob or ArrayBuffer that has a valid JSON when converted to string. By default, the
data is expected to be in JSON format when converted to a string, but the data format can be changed.

```ts
// src/main.ts
import { UserProfilePage } from "./profile.model";

async function main() {
    const data = new Blob([`
    {
        "profile": {
            "profilePicture": "https://example.site.com/user/1/photo/profile.png",
            "bioLink": "https://example.site.com/user/1/bio.html"
        }
    }
    `]);
    const profile: UserProfilePage = UserProfilePage.fromBlob(data);
    const profile2: UserProfilePage = UserProfilePage.fromBuffer(await data.arrayBuffer());
}

main();
```

However, you can change the data format that the Blob or ArrayBuffer is holding. You can view the full list of arguments
for [fromBlob](https://cookienerd-frameworks.gitlab.io/gingersnap/internal/classes/annotations_model_model.Model.html#fromBlob)
and [fromBuffer](https://cookienerd-frameworks.gitlab.io/gingersnap/internal/classes/annotations_model_model.Model.html#fromBuffer)

```ts
// from gingersnap/data/model
export enum DataFormat {
  AVRO,
  CSV,
  XML,
  JSON,
  MESSAGE_PACK,
  CBOR,
}
```

```ts
// src/main.ts
import { UserProfilePage } from "./profile.model";
import { DataFormat } from 'gingersnap/data/model';

function main (data: Blob) {
  const profile: UserProfilePage = UserProfilePage.fromBlob(data, DataFormat.MESSAGE_PACK);
}

main();
```

## Create Empty Model

You can also create an empty model, where no data validation takes place. This requires you to set the properties 
individually.

```ts
// src/main.ts
import { UserProfilePage } from "./profile.model";

function main (data: Blob) {
  const profile = new UserProfilePage();
  profile.profilePicture = 'https://example.site.com/user/1/photo/profile.png';
  profile.bioLink = 'https://example.site.com/user/1/bio.html';
}

main();
```

::: warning
Given no data validation occurs, uninitialized expected properties could cause issues in areas of your application that
is trying to read an **undefined** value.
:::

## Converting Models to String, Object and Binary Formats

You can convert your models back to the original source format, or another format. You can learn more from the
[Model Reference](https://cookienerd-frameworks.gitlab.io/gingersnap/internal/classes/annotations_model_model.Model.html)

```ts
// src/main.ts
import { UserProfilePage } from "./profile.model";

function main() {
    const profile: UserProfilePage = UserProfilePage.fromJSON({
        profile: {
            profilePicture: 'https://example.com',
            bioLink: ''
        }
    });
    
    console.log('converting model to json string...');
    console.log(profile.json());

    console.log('converting model to json object...');
    console.log(profile.object());

    console.log('converting model to xml string...');
    console.log(profile.xml());

    console.log('converting model to cbor array buffer...');
    console.log(profile.cbor());

    console.log('converting model to message pack array buffer...');
    console.log(profile.messagePack());

    console.log('converting model to avro array buffer...');
    console.log(profile.avro());

    console.log('converting model to blob...');
    console.log(profile.blob());

    console.log('converting model to arrayBuffer...');
    console.log(profile.buffer());

    console.log('converting model to csv string...');
    console.log(profile.csv());
}

main();
```
