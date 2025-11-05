import { execSync } from 'child_process';
console.log('Resetting database...');
execSync('pnpm db:down && pnpm db:up && pnpm prisma:migrate:dev && pnpm prisma:seed', { stdio: 'inherit' });
