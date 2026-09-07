import { entityResolvers } from "./entities";
import { mutationResolvers } from "./mutation";
import { queryResolvers } from "./query";
import { scalarResolvers } from "./scalars";
import { subscriptionResolvers } from "./subscription";

export const resolvers = [
  scalarResolvers,
  queryResolvers,
  mutationResolvers,
  subscriptionResolvers,
  entityResolvers,
];
