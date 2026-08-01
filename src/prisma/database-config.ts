import 'dotenv/config';

function requiredDatabaseEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} must be set before Prisma initializes`);
  }

  return value;
}

export function getDatabaseConnectionString() {
  const host = requiredDatabaseEnv('POSTGRES_HOST');
  const port = requiredDatabaseEnv('POSTGRES_PORT');
  const user = requiredDatabaseEnv('POSTGRES_USER');
  const password = requiredDatabaseEnv('POSTGRES_PASSWORD');
  const database = requiredDatabaseEnv('POSTGRES_DB');

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}?schema=public`;
}
