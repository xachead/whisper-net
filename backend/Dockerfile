# Multi-stage build for WhisperNet Spring Boot Backend (Java 25 LTS)
FROM maven:3.9-eclipse-temurin-25-alpine AS builder

WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -B

COPY src ./src
RUN mvn clean package -DskipTests

# Run stage
FROM eclipse-temurin:25-jre-alpine

WORKDIR /app
RUN addgroup -S whispernet && adduser -S whispernet -G whispernet
COPY --from=builder /app/target/whispernet-backend-1.0.0.jar app.jar
RUN chown whispernet:whispernet app.jar

# Sensible image-level defaults; overridden by runtime environment variables or Compose
ENV SPRING_PROFILES_ACTIVE=prod \
    PORT=8080

USER whispernet
EXPOSE 8080

# Production JVM container flags: respect cgroup memory limits, use 75% max RAM percentage, exit on OOM
ENTRYPOINT ["sh", "-c", "exec java --enable-native-access=ALL-UNNAMED -XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0 -XX:+ExitOnOutOfMemoryError ${JAVA_OPTS} -jar app.jar"]
