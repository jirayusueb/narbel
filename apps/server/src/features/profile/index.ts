export { createProfileModule, type ProfileDeps } from "./ioc";
// boards, discussion and notification build this themselves until PeopleDirectory replaces it
export { DrizzleProfileRepository } from "./infrastructure/repositories/DrizzleProfileRepository";
