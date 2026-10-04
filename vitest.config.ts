import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests cover the dependency-free logic modules (SSE parser, answer wire
    // formats, cloze parser, selectors, error mapping, tour logic), not components.
    include: ['src/test/**/*.test.ts'],
    environment: 'node',
    globals: false
  }
});
