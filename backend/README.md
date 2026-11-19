# WhisperNet — Spring Boot Backend

Java 25 LTS / Spring Boot `4.1.2` REST microservice providing persistent secret storage, zero-knowledge ciphertext handling, Bouncy Castle Java LTS `2.73.13` Scrypt + AES-256-GCM fallback encryption, pessimistic concurrency locking, sliding-window rate limiting, and H2/PostgreSQL persistence for WhisperNet.

## Environment & Key Stack Versions

- **Java:** Java 25 LTS (`<java.version>25</java.version>`, `<maven.compiler.release>25</maven.compiler.release>`)
- **Spring Boot:** `4.1.2` (Spring Framework 7, Jackson 3 `tools.jackson.databind.*`, modular starters: `spring-boot-starter-webmvc`, `spring-boot-starter-data-jpa`, `spring-boot-starter-validation`, `spring-boot-h2console`, `spring-boot-starter-webmvc-test`, `spring-boot-starter-data-jpa-test`)
- **Cryptography:** Bouncy Castle Java LTS `2.73.13` (`org.bouncycastle:bcprov-lts8on:2.73.13`) + JCA `AES/GCM/NoPadding`
- **Database:** H2 in-memory (default profile) or PostgreSQL 18 Alpine (`prod` profile via Docker Compose)
- **Build:** Apache Maven `3.8.7+` (or included Maven Wrapper `./mvnw` `3.9.16`)

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/secrets` | Store a client-encrypted secret (`clientEncrypted: true`) or server-side encrypted secret (max 64 KB) |
| `GET` | `/api/secrets/{id}` | Check secret existence, `burnOnRead`, `isPaused`, `clientEncrypted`, `expiresAt`, and public `salt` |
| `POST` | `/api/secrets/{id}/decrypt` | Verify `tokenVerifier` (or `token`/`passphrase` fallback) with 5-attempt lockout, pessimistic write lock, and burn-on-read |
| `POST` | `/api/secrets/{id}/manage` | Pause, resume, or delete a secret using constant-time `adminToken` verification |

## Running Locally (H2 In-Memory)

```bash
# Verified with OpenJDK 25.0.5.0.3 and Apache Maven 3.8.7
mvn spring-boot:run
```

- Server starts on `http://localhost:8080`.
- H2 web console is enabled in the default profile at `http://localhost:8080/h2-console` (`jdbc:h2:mem:whispernetdb`, user `sa`, empty password) via `spring-boot-h2console`.

## Running with Docker Compose (PostgreSQL 18)

> Note: Docker Compose runtime startup was not executed in this container; verify locally when Docker is available.

```bash
cp .env.example .env
# Edit .env to set a strong POSTGRES_PASSWORD
docker compose up --build
```

- Boots `postgres:18-alpine` (bound to `127.0.0.1:5432`, using the PostgreSQL 18 volume layout `/var/lib/postgresql`) and `whispernet-backend` (multi-stage `eclipse-temurin:25-jre-alpine`, non-root user `whispernet`, `--enable-native-access=ALL-UNNAMED`).

## Running Tests & Packaging

```bash
# Run all 15 JUnit 5 & MockMvc tests (verified passing)
mvn test

# Run tests and build executable JAR target/whispernet-backend-1.0.0.jar (verified passing)
mvn package
```
