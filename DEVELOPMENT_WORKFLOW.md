# ImpossibleDB Development Workflow

This document outlines the development workflow for ImpossibleDB, providing guidelines for contributors to ensure consistent, high-quality code.

## Getting Started

1. **Review the Roadmap**: Check [ROADMAP.md](./ROADMAP.md) to understand current priorities and upcoming features
2. **Understand the Project Structure**: Familiarize yourself with [PROJECT_MAP.md](./PROJECT_MAP.md)
3. **Set Up Your Environment**:
   ```bash
   git clone https://github.com/impossibledb/impossibledb.git
   cd impossibledb
   npm install
   npm test
   ```

## Development Process

### 1. Feature Planning

Before writing code:

1. **Check the Roadmap**: Ensure your feature aligns with project priorities
2. **Create an Issue**: Describe the feature or bug you're addressing
3. **Design First**: Sketch interfaces and data flows before implementation
4. **Discuss Complex Changes**: For major features, discuss your approach with maintainers

### 2. Implementation Guidelines

Follow these principles when implementing features:

1. **Test-Driven Development**:
   - Write tests first in the corresponding test directory
   - Implement the feature to satisfy the tests
   - Aim for >90% test coverage for new code

2. **Code Organization**:
   - **One responsibility per file** - Keep each file focused on a single task
   - **Clear interfaces** - Define and follow interfaces for module boundaries
   - **Minimal coupling** - Reduce dependencies between modules
   - **Comprehensive comments** - Explain the "why" not just the "what"
   - **50-100 lines per file** - Keep files small and focused

3. **Module Development Sequence**:
   - Follow the priority order in [ROADMAP.md](./ROADMAP.md)
   - Ensure dependencies are implemented before dependent modules
   - Current focus areas: Query System and Transaction Support

### 3. Pull Request Process

1. **Create a Branch**: Use the format `feature/feature-name` or `fix/issue-description`
2. **Small, Focused PRs**: Keep changes focused on a single feature or fix
3. **Update Documentation**: Update relevant docs and add inline comments
4. **Run All Tests**: Ensure all tests pass before submitting
5. **PR Description**: Include a clear description of changes and reference related issues

## Testing Protocol

For each module:

1. **Unit Tests**: Test individual functions and classes in isolation
2. **Integration Tests**: Test interactions between components
3. **End-to-End Tests**: Test complete workflows from client to storage
4. **Performance Tests**: For critical paths, include performance benchmarks

Run tests with:
```bash
npm test                 # Run all tests
npm run test:coverage    # Run tests with coverage report
```

## Deployment

The project supports multiple deployment environments:

- **Development**: `npm run deploy:dev`
- **Testing**: `npm run deploy:test`
- **Production**: `npm run deploy:production`

Always test in development and testing environments before deploying to production.

## Working with AI Assistance

When using AI tools to assist development:

### Effective Prompting

1. **Be specific about the file and function**:
   ```
   Implement the `getNode(key: string): string` function in src/routing/consistentHash.ts
   ```

2. **Provide context about related modules**:
   ```
   This function will be called by router.ts and needs to use the hash function from utils/hashing.ts
   ```

3. **Specify requirements and constraints**:
   ```
   The implementation should be efficient for frequent lookups and infrequent node changes
   ```

4. **Reference project documentation**:
   ```
   Follow the module structure in PROJECT_MAP.md and the roadmap priorities in ROADMAP.md
   ```

### AI Implementation Review

After receiving AI-generated code:

1. **Check for file path consistency** - Ensure it's for the correct file
2. **Verify interface compliance** - Make sure it follows defined interfaces
3. **Examine dependencies** - Confirm imports and exports are correct
4. **Review for simplicity** - Look for unnecessary complexity
5. **Check comment quality** - Ensure implementation is well-explained
6. **Verify test coverage** - Ensure tests cover the implementation

## Contribution Priorities

Current priority areas for contribution (see [ROADMAP.md](./ROADMAP.md) for details):

1. **Query System Enhancement** - Implementing the query processing pipeline
2. **Transaction Support** - Adding ACID transaction capabilities
3. **Performance Optimization** - Improving speed and efficiency
4. **Documentation** - Expanding guides and examples
