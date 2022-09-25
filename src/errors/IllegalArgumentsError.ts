export default class IllegalArgumentsError extends Error {
  readonly arguments: any[];

  constructor(args: any[]) {
    super(`Received invalid arguments of type ${args.map((arg) => typeof arg).join(",")}`);
    this.arguments = args;
  }
}
