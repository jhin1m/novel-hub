import { runMigrations } from '../migrate';
import { testDatabaseUrl } from './index';

/** `globalSetup` của project `integration`: migrate DB test một lần cho mọi package. */
export default async function setup(): Promise<void> {
  await runMigrations(testDatabaseUrl());
}
