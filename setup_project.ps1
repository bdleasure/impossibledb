Write-Host "Creating ImpossibleDB project structure..." -ForegroundColor Cyan

# Define directories to create
$directories = @(
    # Source directories
    "src",
    "src\objects",
    "src\routing",
    "src\query",
    "src\sync",
    "src\client",
    "src\utils",
    
    # Test directories
    "test",
    "test\unit",
    "test\unit\objects",
    "test\unit\routing",
    "test\unit\query",
    "test\unit\sync",
    "test\unit\client",
    "test\integration",
    "test\e2e",
    "test\mocks",
    
    # Examples
    "examples",
    "examples\simple-crud",
    "examples\query-demo",
    "examples\transaction-demo",
    
    # Documentation
    "docs",
    "docs\api",
    "docs\architecture",
    "docs\tutorials",
    
    # Scripts
    "scripts"
)

# Create all directories
foreach ($dir in $directories) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "Created directory: $dir" -ForegroundColor Green
    } else {
        Write-Host "Directory already exists: $dir" -ForegroundColor Yellow
    }
}

# Define files to create
$files = @(
    # Main source files
    "src\index.ts",
    "src\config.ts",
    "src\types.ts",
    
    # Objects files
    "src\objects\StorageObject.ts",
    "src\objects\ShardManager.ts",
    "src\objects\TransactionCoordinator.ts",
    
    # Routing files
    "src\routing\consistentHash.ts",
    "src\routing\localityManager.ts",
    "src\routing\router.ts",
    
    # Query files
    "src\query\parser.ts",
    "src\query\planner.ts",
    "src\query\executor.ts",
    "src\query\aggregator.ts",
    
    # Sync files
    "src\sync\twoPhaseCommit.ts",
    "src\sync\conflictDetector.ts",
    "src\sync\lockManager.ts",
    
    # Client files
    "src\client\ImpossibleDBClient.ts",
    "src\client\Collection.ts",
    "src\client\Transaction.ts",
    "src\client\QueryBuilder.ts",
    
    # Utils files
    "src\utils\logger.ts",
    "src\utils\validation.ts",
    "src\utils\errorHandler.ts",
    
    # Config files
    "package.json",
    "tsconfig.json",
    "wrangler.toml",
    "webpack.config.js",
    "jest.config.js",
    "README.md"
)

# Create all files if they don't exist
foreach ($file in $files) {
    if (-not (Test-Path $file)) {
        New-Item -ItemType File -Path $file -Force | Out-Null
        Write-Host "Created file: $file" -ForegroundColor Green
    } else {
        Write-Host "File already exists: $file" -ForegroundColor Yellow
    }
}

Write-Host "ImpossibleDB project structure created successfully!" -ForegroundColor Cyan