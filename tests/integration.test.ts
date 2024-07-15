import { GingerSnap } from "../src/networking";
import { User, UserService } from "./mocks/user";
import * as R from "ramda";
import { UtilService } from "./mocks/util";
import { AuthService } from "./mocks/auth";
import { THROTTLE_DEFAULT_MS } from "../src/networking/decorators";
import {
  createModelClassAnnotationTag,
  createModelFieldAnnotationTag,
  getModelClassAnnotationTagProperties,
  getModelFieldAnnotationTagProperties,
  Field,
  Model,
} from "../src/data/model";
import { StreamUser, UserStream } from "./mocks/stream";
import { Client, Server } from "mock-socket";
import { users } from "./data/users.json";
import { Collectors } from "../src/stream/collector";
import { Future } from "../src/future";

jest.setTimeout(10000);

const MOCKED_USERS = [
  {
    name: "Will Carter",
    contact_no: "0123456789",
    timestamp: "January 20, 2022",
    updatedAt: "January 21, 2022",
    totalReferences: 1,
    bestie: {
      name: "Sandy Carter",
      contact_no: "0123456299",
      timestamp: "January 20, 2022",
      updatedAt: "January 21, 2022",
      friends: [],
      totalReferences: 1,
    },
    friends: [
      {
        name: "James Carter",
        contact_no: "0123456799",
        timestamp: "January 20, 2022",
        updatedAt: "January 21, 2022",
        friends: [],
        totalReferences: 1,
      },
    ],
  },
];

describe("Test Network Service", function () {
  it("should lookup all users", async () => {
    (global.fetch as any) = async () => new Response(JSON.stringify(MOCKED_USERS));

    const snap = new GingerSnap({ baseUrl: "https://test.com" });
    const service = snap.create(UserService);
    const call = service.getUsers();
    const users = await call.execute();
    expect(users).toHaveLength(1);
    expect(users[0]).toBeTruthy();
    expect(String(users[0].tel)).toEqual("0123456789");
    expect(String(users[0].name)).toEqual("Will Carter");
    expect(users[0].createdOn.toISOString()).toEqual(new Date("January 20, 2022").toISOString());
    expect(users[0].updatedAt.toISOString()).toEqual(new Date("January 21, 2022").toISOString());
    expect(users[0].references).toBe(1);
    expect(users[0].friends).toHaveLength(1);
    expect(String(users[0].friends[0].name)).toEqual("James Carter");
    expect(users[0].bestie).toBeDefined();
    expect(String(users[0].bestie?.name)).toEqual("Sandy Carter");
  });

  // it("should lookup user profile and bio", async () => {
  //   (global.fetch as any) = async (url: string) => {
  //     if (url.toString() === "https://test.com/feeds/users/test-id") {
  //       return new Response(`
  //         <?xml version="1.0" encoding="ISO-8859-1" ?>
  //         <profile>
  //           <profilePicture>picture.jpeg</profilePicture>
  //           <bioLink>https://wiki.com/Will%20Carter</bioLink>
  //           <name>Will Carter</name>
  //           <friends>
  //               <name>James Carter</name>
  //               <contact_no>0123456799</contact_no>
  //               <timestamp>January 20, 2022</timestamp>
  //               <updatedAt>January 21, 2022</updatedAt>
  //               <totalReferences>1</totalReferences>
  //               <friends />
  //           </friends>
  //           <contact_no>0123456789</contact_no>
  //           <timestamp>January 20, 2022</timestamp>
  //           <bestie>
  //               <name>Sandy Carter</name>
  //               <contact_no>0123456299</contact_no>
  //               <timestamp>January 20, 2022</timestamp>
  //               <updatedAt>January 21, 2022</updatedAt>
  //               <totalReferences>1</totalReferences>
  //               <friends></friends>
  //           </bestie>
  //           <updatedAt>January 21, 2022</updatedAt>
  //           <totalReferences>1</totalReferences>
  //         </profile>
  //         `);
  //     }
  //     return new Response("Invalid request", { status: 400 });
  //   };
  //
  //   const snap = new GingerSnap({ baseUrl: "https://test.com" });
  //   const service = snap.create(UserService);
  //   const call = service.getUserFeed("test-id");
  //   const data = await call.execute();
  //   expect(data).toBeDefined();
  //   const profile = data.profile;
  //
  //   expect(profile).toBeDefined();
  //   expect(String(profile.tel)).toEqual("0123456789");
  //   expect(String(profile.name)).toEqual("Will Carter");
  //   expect(profile.createdOn.toISOString()).toEqual(new Date("January 20, 2022").toISOString());
  //   expect(profile.updatedAt.toISOString()).toEqual(new Date("January 21, 2022").toISOString());
  //   expect(profile.references).toBe(1);
  //   expect(profile.friends).toHaveLength(1);
  //   expect(String(profile.friends[0].name)).toEqual("James Carter");
  //   expect(profile.bestie).toBeDefined();
  //   expect(String(profile.bestie?.name)).toEqual("Sandy Carter");
  //   expect(String(profile.profilePicture)).toEqual("picture.jpeg");
  //   expect(String(profile.bioLink)).toEqual(`https://wiki.com/${encodeURI(profile.name)}`);
  // });

  it("should create user", async () => {
    (global.fetch as any) = async () => new Response(JSON.stringify(MOCKED_USERS[0]));

    const snap = new GingerSnap({ baseUrl: "https://test.com" });
    const service = snap.create(UserService);
    const resp = await service.createUser(User.fromJSON(MOCKED_USERS[0])).execute();
    expect(resp instanceof User).toBeTruthy();
    expect(resp.json()).toEqual(User.fromJSON(MOCKED_USERS[0]).json());

    const resp2 = await service.createUser2("test").execute();
    expect(resp2 instanceof User).toBeTruthy();
    expect(resp2.json()).toEqual(User.fromJSON(MOCKED_USERS[0]).json());
  });

  it("should delete user", async () => {
    (global.fetch as any) = async (url: string, options: any) => {
      if (url.toString() === "https://test.com/users/test-id" && options.headers["Session-Id"] === "test-session") {
        return new Response(JSON.stringify(MOCKED_USERS[0]));
      }
      return new Response(undefined, { status: 400 });
    };

    const snap = new GingerSnap({ baseUrl: "https://test.com" });
    const service = snap.create(UserService);
    const resp = await service.deleteUser("test-id", "test-session").execute();
    expect(resp instanceof User).toBeTruthy();
    expect(resp.json()).toEqual(User.fromJSON(MOCKED_USERS[0]).json());
  });

  it("should update user", async () => {
    (global.fetch as any) = async (url: string, options: any) => {
      if (
        url.toString() === "https://test.com/users/test-id" &&
        options.headers["Session-Id"] === "test-session" &&
        options.method.toLowerCase() === "put"
      ) {
        return new Response(JSON.stringify(MOCKED_USERS[0]));
      }
      return new Response(undefined, { status: 400 });
    };

    const snap = new GingerSnap({ baseUrl: "https://test.com" });
    const service = snap.create(UserService);
    const resp = await service
      .updateUser(User.fromJSON(MOCKED_USERS[0]), "test-id", { "Session-Id": "test-session" })
      .execute();
    expect(resp instanceof User).toBeTruthy();
    expect(resp.json()).toEqual(User.fromJSON(MOCKED_USERS[0]).json());
  });

  it("should get user by query", async () => {
    (global.fetch as any) = async (url: string, options: any) => {
      if (url.toString() === "https://test.com/users?name=test" && options.method.toLowerCase() === "get") {
        return new Response(JSON.stringify(MOCKED_USERS[0]));
      } else if (
        url.toString() === "https://test.com/users?name=test&tel=1234567" &&
        options.method.toLowerCase() === "get"
      ) {
        return new Response(JSON.stringify(MOCKED_USERS[0]));
      }
      return new Response(undefined, { status: 400 });
    };

    const snap = new GingerSnap({ baseUrl: "https://test.com" });
    const service = snap.create(UserService);
    const start = performance.now();
    let resp = await service.getUserByName("test").execute();
    const end = performance.now();

    // Check that the request was throttled
    expect(end - start).toBeGreaterThan(3000);
    expect(resp instanceof User).toBeTruthy();
    expect(resp.json()).toEqual(User.fromJSON(MOCKED_USERS[0]).json());

    resp = await service.getUserByProperties({ name: "test", tel: "1234567" }).execute();
    expect(resp instanceof User).toBeTruthy();
    expect(resp.json()).toEqual(User.fromJSON(MOCKED_USERS[0]).json());
  });

  it("should get user by overriding queries", async () => {
    (global.fetch as any) = async (url: string, options: any) => {
      if (url.toString() === "https://test.com/users?tel=0987654321" && options.method.toLowerCase() === "get") {
        return new Response(JSON.stringify(MOCKED_USERS[0]));
      }
      return new Response(undefined, { status: 400 });
    };

    const snap = new GingerSnap({ baseUrl: "https://test.com" });
    const service = snap.create(UserService);
    const start = performance.now();
    const resp = await service.getUserByTel("0987654321").execute();
    const end = performance.now();

    // Check that the request was throttled
    expect(end - start).toBeGreaterThan(1000);
    expect(end - start).toBeLessThan(2000);
    expect(resp instanceof User).toBeTruthy();
    expect(resp.json()).toEqual(User.fromJSON(MOCKED_USERS[0]).json());
  });

  it("should complete health check", async () => {
    (global.fetch as any) = async (url: string, options: any) => new Response("Ok");

    const snap = new GingerSnap({ baseUrl: "https://test.com" });
    const service = snap.create(UtilService);
    const resp: string = await service.healthCheck().execute();

    expect(typeof resp === "string").toBeTruthy();
    expect(resp).toEqual("Ok");
  });

  it("should cache response for given duration", async () => {
    (global.fetch as any) = async (url: string, options: any) => new Response(String(Math.random()));

    const snap = new GingerSnap({ baseUrl: "https://test.com" });
    const service = snap.create(UtilService);
    const resp: string = await service.randomNumCheck().execute();
    const resp2: string = await service.randomNumCheck().execute();

    expect(resp).toEqual(resp2);
    await Future.sleep({ seconds: 2 });
    expect(resp).not.toEqual(await service.randomNumCheck().execute());
  });

  it("should get binary data response", async () => {
    (global.fetch as any) = async (url: string, options: any) => new Response("Ok");

    const snap = new GingerSnap({ baseUrl: "https://test.com" });
    const service = snap.create(UtilService);
    const resp = await service.downloadFile().execute();

    expect(Object.getPrototypeOf(resp).constructor.name).toBe("Blob");
    expect(await resp.text()).toEqual("Ok");
  });

  it("should upload text file", async () => {
    (global.fetch as any) = async (url: string, options: any) => {
      expect(options.body).toEqual("sample text");
      return new Response();
    };

    const snap = new GingerSnap({ baseUrl: "https://test.com" });
    const service = snap.create(UtilService);
    const resp = await service.uploadTextFile("sample text").execute();

    expect(resp).toBe(null);
  });

  it("should upload form urlencoded", async () => {
    (global.fetch as any) = async (url: string, options: any) => {
      expect(options.body instanceof URLSearchParams).toBeTruthy();
      expect(options.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
      expect(Array.from(options.body.entries())).toEqual([
        ["name", "test"],
        ["age", "21"],
      ]);
      return new Response();
    };

    const snap = new GingerSnap({ baseUrl: "https://test.com" });
    const service = snap.create(UtilService);
    const resp = await service.uploadUserForm("test", 21).execute();

    expect(resp).toBe(null);
  });

  it("should upload multipart with auth", async () => {
    let called = 0;
    (global.fetch as any) = async (url: string, options: any) => {
      called++;
      if (!options.headers.Authorization) {
        return new Response(undefined, { status: 401 });
      }
      expect(options.headers.Authorization.includes("Basic ")).toBeTruthy();
      expect(options.headers["Content-Type"]).toBe("multipart/form-data");
      expect(options.body instanceof FormData).toBeTruthy();
      expect(Array.from(options.body.entries())).toEqual([
        ["file", new File([new Blob(["test"])], "name")],
        ["name", "test-upload"],
      ]);
      return new Response();
    };

    const snap = new GingerSnap({ baseUrl: "https://test.com" });
    const service = snap.create(UtilService);
    const resp = await service.uploadFileAndName(new Blob(["test"]), "test-upload").execute();

    expect(resp).toBe(null);
    expect(called).toBe(2);
  });

  it("should upload xml with auth refresh", async () => {
    let refreshed = false;
    (global.fetch as any) = async (url: string, options: any) => {
      if (url.toString() === "https://test.com/api/v1/auth/refresh") {
        refreshed = true;
        return new Response(
          JSON.stringify({
            username: "test",
            password: "password",
          })
        );
      } else if (url.toString() === "https://test.com/upload/xml" && refreshed) {
        expect(options.headers.Authorization).toEqual(`Basic ${btoa("test:password")}`);
        expect(options.body).toEqual(User.fromJSON(MOCKED_USERS[0]).xml());
        return new Response();
      } else if (url.toString() === "https://test.com/upload/xml" && !refreshed) {
        return new Response(undefined, { status: 401 });
      }
      return new Response(undefined, { status: 400 });
    };

    const snap = new GingerSnap({ baseUrl: "https://test.com" });
    const service = snap.create(UtilService);
    service.loginAnonymously();
    await service
      .uploadXML(User.fromJSON(MOCKED_USERS[0]))
      .map((v) => {
        expect(v).toBe(null);
        return 0;
      })
      .consume(1);
  });

  it("should retry request on service failure", async () => {
    let called = 0;
    (global.fetch as any) = async (url: string, options: any) => {
      called++;
      if (called <= 3) {
        return new Response(undefined, { status: 503 });
      }
      return new Response("check");
    };

    const snap = new GingerSnap({ baseUrl: "https://test.com" });
    const service = snap.create(UtilService);
    const start = performance.now();
    const resp = await service.healthCheck().execute();
    const end = performance.now();
    expect(end - start).toBeGreaterThanOrEqual(THROTTLE_DEFAULT_MS * 3);
    expect(resp).toBe("check");
    expect(called).toBe(4);
  });

  it("should login with optional field", async () => {
    (global.fetch as any) = async (url: string, options: any) =>
      new Response(JSON.stringify({ accessToken: "jwt", refreshToken: "jwt-refresh" }));

    const snap = new GingerSnap({ baseUrl: "https://test.com" });
    const service = snap.create(AuthService);
    const resp = await service.loginWithEmailAndPassword("test@test.com").execute();
    expect(resp.accessToken).toBe("jwt");
    expect(resp.refreshToken).toBe("jwt-refresh");
  });

  it("should create model class/field plugins", () => {
    let called = false;
    const CustomTag = createModelClassAnnotationTag("CustomTag", { test: true });
    const CustomFieldTag = createModelFieldAnnotationTag(
      "CustomFieldTag",
      { test2: true },
      (tagName: string, properties: Object, target: Model, fieldName: string) => {
        called = true;
        expect(tagName).toEqual("CustomFieldTag");
        expect(properties).toEqual({ test2: true });
        expect(fieldName).toEqual("test");
        expect((target as any).test).toEqual("custom test");
      }
    );

    @CustomTag
    class Test extends Model {
      @CustomFieldTag
      @Field()
      test!: String;
    }

    const properties = getModelClassAnnotationTagProperties(["CustomTag"], Test);
    expect(R.dissocPath([0, "modelClass"], properties)).toEqual([
      { properties: { test: true }, modelClassName: "Test" },
    ]);

    const model = Test.fromJSON({ test: "custom test" });
    expect(model).toBeDefined();
    expect(called).toBeTruthy();
    const fieldProperties = getModelFieldAnnotationTagProperties(["CustomFieldTag"], Test);
    expect(fieldProperties).toEqual([
      {
        Type: String,
        fieldName: "test",
        isArray: false,
        tagName: "CustomFieldTag",
        tagProperties: { test2: true },
      },
    ]);
  });

  it("should stream users from socket", async () => {
    const url = "ws://localhost.com";
    const server = new Server(url);
    const snap = new GingerSnap({ baseUrl: url });
    const service = snap.create(UserStream);
    const connFut = Future.of<Client>((resolve) => server.on("connection", resolve)).schedule();
    await service.ready();
    const streamFut = service.getDCUsers().take(2).collect(Collectors.asList()).schedule();
    const conn = await connFut;
    users.forEach((user) => conn.send(JSON.stringify(user)));
    expect(await streamFut).toEqual(
      users
        .filter((v) => v.address.state === "DC")
        .slice(0, 2)
        .map((v) => StreamUser.fromJSON(v))
    );
  });
});
