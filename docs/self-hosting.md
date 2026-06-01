# Self-Hosting Argus Monitor

This guide will walk you through the process of self-hosting Argus Monitor.

## Prerequisites

- **Database and Redis Security**: Ensure your PostgreSQL and Redis instances are properly secured with strong passwords, restricted network access (e.g., binding to specific interfaces, firewall rules), and encryption if sensitive data is stored. Never expose these services directly to the public internet.
- **Docker and Docker Compose installed**
- **Sufficient system resources**: For a small deployment (e.g., 1-5 monitors), a VPS with 2 vCPU and 4GB RAM is a good starting point. Scale up as needed for larger numbers of monitors or checks. Consider monitoring your resource usage and scaling up your VPS plan or optimizing your database/Redis configurations if you experience performance bottlenecks.
- A PostgreSQL database instance (can be run via Docker Compose or externally).
- A Redis instance (can be run via Docker Compose or externally).
- A domain name configured to point to your server's IP address (for SSL).

## Setup Steps

### Important Security Considerations:
*   **Secure your .env file**: Never commit your .env file to version control. Ensure it has strict file permissions to prevent unauthorized access.
*   **Regularly update dependencies**: Keep your Docker images and system packages up-to-date to mitigate known vulnerabilities.
*   **Monitor logs**: Regularly review application and server logs for suspicious activity.
*   **API Endpoint Security**: The API service should only be accessible via the reverse proxy to ensure all security measures (SSL, rate limiting, etc.) are applied. Do not expose the API service directly to the public internet.
*   **BullMQ Dashboard Security**: The BullMQ UI service is a management interface. It should also be protected by a reverse proxy and not exposed directly to the public internet, even with password protection. Exposing it directly increases the attack surface and risk of data exposure or unauthorized control.

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/fatoh2/argus-monitor.git
    cd argus-monitor
    ```

2.  **Configure Environment Variables**:
    Create a `.env` file in the project root (same directory as `docker-compose.prod.yml`). This file will contain all necessary environment variables for your services. Below is a complete example of the variables you will need to define:

    ```dotenv
    DATABASE_URL="postgresql://user:password@db:5432/database"
    REDIS_URL="redis://:password@redis:6379/0"
    POSTGRES_USER="your_postgres_user"
    POSTGRES_PASSWORD="your_postgres_password"
    POSTGRES_DB="your_postgres_db"
    REDIS_PASSWORD="your_redis_password"
    JWT_SECRET="a_very_long_and_random_secret_key"
    HELIUS_API_KEY="your_helius_api_key"
    BULLMQ_UI_USERNAME="your_bullmq_ui_username"
    BULLMQ_UI_PASSWORD="your_bullmq_ui_password"
    ```

    Fill in your actual database and Redis credentials, and generate a strong, random `JWT_SECRET`.

    **Important**:
    *   Ensure `DATABASE_URL` and `REDIS_URL` are correctly set to point to your PostgreSQL and Redis instances. When using `docker-compose.prod.yml`, use the service names `db` and `redis` as hosts.
    *   **Minimum required variables for application startup:** `DATABASE_URL`, `REDIS_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `REDIS_PASSWORD`, `JWT_SECRET`, `HELIUS_API_KEY`.
    *   `HELIUS_API_KEY`: Required for any blockchain monitoring features. Obtain one from Helius.
    *   Do not leave critical variables empty or malformed, as this can lead to application startup failures.
    *   Always use strong, random passwords for `POSTGRES_USER`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `BULLMQ_UI_USERNAME`, `BULLMQ_UI_PASSWORD`, and your database/Redis instances.
    *   **Important**: Change all default placeholder values in `.env` to strong, random passwords and secrets before deploying to production.
    *   Consider using a tool or script to validate `.env` file contents before starting services to catch common misconfigurations early.
    *   Review the `.env` file itself for secure defaults and clear explanations of each variable.

3.  **Set up Docker Compose**:
    `docker-compose.dev.yml` is provided for local development and includes example services for PostgreSQL and Redis. For production, `docker-compose.prod.yml` includes services for PostgreSQL and Redis, designed for a self-contained deployment. If you wish to manage PostgreSQL and Redis with Docker Compose in production, you can adapt the relevant service definitions from `docker-compose.prod.yml` into your setup, ensuring you configure appropriate volumes and strong passwords for production use. This distinction is important: `docker-compose.dev.yml` is for quick local setup with integrated databases, while `docker-compose.prod.yml` is for production, assuming external or explicitly configured production-ready databases.

4.  **Run Database Migrations**:
    Before starting the application, you need to run database migrations to set up the schema.
