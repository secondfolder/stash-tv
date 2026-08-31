import type { MockContext } from "../context";

export const subscriptionResolvers = {
  Subscription: {
    scanCompleteSubscribe: {
      subscribe: (_src: unknown, _args: unknown, ctx: MockContext) =>
        (async function* () {
          for await (const _ of ctx.store.scanComplete.asyncIterator()) {
            yield { scanCompleteSubscribe: true };
          }
        })(),
    },
    jobsSubscribe: {
      subscribe: (_src: unknown, _args: unknown, ctx: MockContext) =>
        (async function* () {
          for await (const update of ctx.store.jobsUpdated.asyncIterator()) {
            yield { jobsSubscribe: update };
          }
        })(),
    },
    loggingSubscribe: {
      // The app never subscribes to logs; expose an idle iterator for completeness.
      subscribe: () => (async function* () {})(),
    },
  },
};
