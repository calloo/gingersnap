# Data Modelling

Let's walk through a few examples of modelling various data in gingersnap.

## Nested JSON Data & Field Mappings

If you need a property that holds an array, you must use the **@ArrayField** decorator. This decorator expects the class
type of the items being stored in the array. Please note, a property can also be of type Model
```ts
import { ArrayField, Field, Model } from "gingersnap/data/model";

export class User extends Model {
  @Field()
  name!: string;
  
  @ArrayField(User) // [!code focus]
  friends!: User[]; // [!code focus]
}
```

## Field name Mapping

If the field name in your data needs to be mapped to a different field name, you can pass the name to the **@Field**
decorator

```ts
import { ArrayField, Field, Model } from "gingersnap/data/model";

export class User extends Model {
  @Field()
  name!: string;
  
  @ArrayField(User)
  friends!: User[];

  @Field("contact_no")  // [!code focus] // maps contact_no to tel
  tel!: string;  // [!code focus]
}
```

## Mapping property to Date Object

You can convert strings to dates in the models, as well as milliseconds since EPOCH. Any string that can be parsed by
new Date(\<string\>) can be processed

```json
{
  "name": "James Fandom",
  "friends": [{"name":  "John Carter", "friends": []}],
  "tel": "123456789",
  "createdOn": "January 20, 2020" // [!code focus]
}
```

```ts
import { ArrayField, Field, Model } from "gingersnap/data/model";

export class User extends Model {
  @Field() 
  name!: string;
  
  @ArrayField(User) 
  friends!: User[];
  
  @Field("contact_no") 
  tel!: string;
  
  @Field("timestamp") // [!code focus]
  createdOn!: Date; // [!code focus]
}
```

## Optional Properties

You can use **@Ignore** Property for fields that are optional. If they don't exist, an error should not be thrown

```ts
import { ArrayField, Field, Ignore, Model } from "gingersnap/data/model";

export class User extends Model {
  @Field() 
  name!: string;
  
  @ArrayField(User) 
  friends!: User[];
  
  @Field("contact_no") 
  tel!: string;
  
  @Field("timestamp") 
  createdOn!: Date;

  @Ignore() // [!code focus]
  @Field() // [!code focus]
  bestie?: User; // [!code focus]
}
```

**@Ignore** can take an object that allows you to control when the property should be ignored. When no argument is
passed, it defaults to @Ignore({deserialize: true})

```ts
// from gingersnap/data/model for @Ignore
export interface IgnoreProp { 
    serialize?: boolean; // Remove when converting back to string or bytes
    deserialize?: boolean; // Optional when constructing
}
```

```ts
import { ArrayField, Field, Ignore, Model } from "gingersnap/data/model";

export class User extends Model {
  @Field() 
  name!: string;
  
  @ArrayField(User) 
  friends!: User[];
  
  @Field("contact_no") 
  tel!: string;
  
  @Field("timestamp") 
  createdOn!: Date;

  @Ignore() // [!code focus]
  @Field() // [!code focus]
  bestie?: User; // [!code focus]
}
```

## Computed Properties

There might be cases where you need to perform your own processing on the key value pair received. You can create your
own private method that is decorated with the **@Field** property, where the method receives only 1 argument, the raw
value of the key extracted from the data. @Ignore decorator also works on computed property
```json
{
  "updatedAt": "March 10, 2021",
  "totalReferences": "50"
}
```

```ts
import { Field, Model } from "gingersnap/data/model";

export class User extends Model {
  updatedAt!: Date;
  references!: number;

  @Field("updatedAt")
  private computeLastUpdate(value: string): void {
      this.updatedAt = new Date(value);
  }

  @Field()
  private totalReferences(value: string): void {
      this.references = Number(value);
  }
}
```

## Extending Models

Models can be extended by creating a subclass of a model class
```ts
import { Field, Model } from "gingersnap/data/model";

export class User extends Model {
  updatedAt!: Date;
  references!: number;

  @Field("updatedAt")
  private computeLastUpdate(value: string): void {
      this.updatedAt = new Date(value);
  }

  @Field()
  private totalReferences(value: string): void {
      this.references = Number(value);
  }
}

// Extending the User Model
export class UserProfile extends User {
    @Field() 
    profilePicture!: string;
    
    @Field() 
    bioLink!: string;
}
```

## Aliases

You can use **@Alias** decorator for properties that may have different names depending on the data source being read

```ts
import { Alias, Field, Model } from "gingersnap/data/model";

export class User extends Model {
  @Field() 
  name!: string;
  
  @Alias("createdOn") // [!code focus]
  @Alias("creationDate") // [!code focus]
  @Field("timestamp") // [!code focus]
  createdOn!: Date; // [!code focus]
}
```

## Default Values

You can set default values for properties if they don't exist. Thus, the exclamation sign (!) would not be required.

```ts
import { ArrayField, Field, Model } from "gingersnap/data/model";

export class User extends Model {
  @Field()
  name!: string;
  
  @ArrayField(User) // [!code focus]
  friends: User[] = []; // [!code focus]

  @Field("contact_no")
  tel!: string;
}
```
