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
*   **Secure your `.env` file**: Never commit your `.env` file to version control. Ensure it has strict file permissions to prevent unauthorized access.
*   **Regularly update dependencies**: Keep your Docker images and system packages up-to-date to mitigate known vulnerabilities.
*   **Monitor logs**: Regularly review application and server logs for suspicious activity.
*   **API Endpoint Security**: The API service should only be accessible via the reverse proxy to ensure all security measures (SSL, rate limiting, etc.) are applied. Do not expose the API service directly to the public internet.

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/fatoh2/argus-monitor.git
    cd argus-monitor
    ```

2.  **Configure Environment Variables**:
    Copy the `.env.example` file to `.env` and fill in your database and Redis credentials, as well as any other required environment variables.
    ```bash
    cp .env.example .env
    # Edit .env file with your specific configurations
    ```
    **Important**:
    *   Ensure `DATABASE_URL` and `REDIS_URL` are correctly set to point to your PostgreSQL and Redis instances.
    *   Do not leave critical variables empty or malformed, as this can lead to application startup failures.
    *   Always use strong, random passwords for `JWT_SECRET`, `BULLMQ_UI_PASSWORD`, and your database/Redis instances.
    *   Consider using a tool or script to validate `.env` file contents before starting services to catch common misconfigurations early.
    *   Review the `.env.example` file itself for secure defaults and clear explanations of each variable.

3.  **Set up Docker Compose**:
    `docker-compose.yml` is provided for local development and includes example services for PostgreSQL and Redis. For production, `docker-compose.prod.yml` is designed to be used with external PostgreSQL and Redis instances. If you wish to manage PostgreSQL and Redis with Docker Compose in production, you can adapt the relevant service definitions from `docker-compose.yml` into `docker-compose.prod.yml`, ensuring you configure appropriate volumes and strong passwords for production use. This distinction is important: `docker-compose.yml` is for quick local setup with integrated databases, while `docker-compose.prod.yml` is for production, assuming external or explicitly configured production-ready databases.

4.  **Run Migrations and Build Services** (using `docker-compose.prod.yml`):
    Ensure your database and Redis are accessible and properly secured. Then, run the migrations and build the services.
    ```bash
    docker-compose -f docker-compose.prod.yml run --rm api-service npx prisma migrate deploy
    docker-compose -f docker-compose.prod.yml build
    ```
    **Troubleshooting Migrations**: If `prisma migrate deploy` fails, carefully review the error messages. Common causes include incorrect `DATABASE_URL` in `.env`, the PostgreSQL database not running or being inaccessible (e.g., due to firewall rules, incorrect host/port, or service not started), or invalid database credentials. Ensure your database is fully initialized and accepting connections.

5.  **Start Argus Monitor Services** (using `docker-compose.prod.yml`):
    ```bash
    docker-compose -f docker-compose.prod.yml up -d
    ```

## Configuration

Refer to the `.env.example` file for all available configuration options and their descriptions.

## SSL Configuration (Recommended for Production)

For production deployments, it is highly recommended to use SSL to secure communication. You can achieve this by using a reverse proxy like Nginx or Caddy in front of your Argus Monitor services.

**Example with Nginx (assuming your domain is `monitor.example.com` and services are named `frontend-service` and `api-service` in your `docker-compose.prod.yml`):**

1.  **Install Nginx**:
    ```bash
    sudo apt update
    sudo apt install nginx
    ```

2.  **Configure Nginx**: Create a new Nginx configuration file (e.g., `/etc/nginx/sites-available/argus-monitor`) and link it to `sites-enabled`.

    ```nginx
    # Rate limiting to prevent DoS attacks (configure as needed)
    # Define a zone for rate limiting. 1r/s means 1 request per second.
    # Adjust 'zone=mylimit:10m' (10MB memory for storing states) and 'rate=1r/s' as appropriate.
    # burst=5 allows for 5 requests over the limit before requests are rejected.
    # nodelay means requests are processed immediately if within burst, otherwise delayed.
    limit_req_zone \$binary_remote_addr zone=mylimit:10m rate=1r/s;

    server {
        listen 80;
        server_name monitor.example.com;

        location / {
            return 301 https://\$host\$request_uri;
        }
    }

    server {
        listen 443 ssl http2;
        server_name monitor.example.com;

        # SSL Certificates - Paths may vary based on your SSL provider (e.g., Certbot, manual).
        # Ensure your SSL private key is securely stored and protected with appropriate file permissions.
        ssl_certificate /etc/letsencrypt/live/monitor.example.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/monitor.example.com/privkey.pem;

        # Security Headers - Recommended for production
        add_header X-Frame-Options "SAMEORIGIN";
        add_header X-Content-Type-Options "nosniff";
        add_header Referrer-Policy "no-referrer-when-downgrade";
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload";

        # Disable unnecessary HTTP methods to reduce attack surface
        if (\$request_method !~ ^(GET|POST|HEAD)$) {
            return 405;
        }

        # Apply rate limiting
        limit_req zone=mylimit burst=5 nodelay;

        # Basic Nginx caching for static assets (adjust as needed)
        location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 30d;
            add_header Cache-Control "public, no-transform";
            proxy_pass http://frontend-service:3000; # Use service name for Docker network
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host \$host;
            proxy_cache_bypass \$http_upgrade;
        }

        location /api/ {
            proxy_pass http://api-service:3001; # Use service name for Docker network
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host \$host;
            proxy_cache_bypass \$http_upgrade;
        }

        location / {
            proxy_pass http://frontend-service:3000; # Use service name for Docker network
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host \$host;
            proxy_cache_bypass \$http_upgrade;
        }
    }
    ```

3.  **Test Nginx configuration and reload**:
    ```bash
    sudo nginx -t
    sudo systemctl reload nginx
    ```
    **Note on `proxy_pass` targets**: When running Nginx and your Argus Monitor services within the same Docker network (e.g., via `docker-compose`), you should use the service names defined in your `docker-compose.prod.yml` (e.g., `frontend-service`, `api-service`) instead of `localhost` or specific IP addresses. If Nginx is running outside the Docker network, you would need to use the host's IP address and the exposed ports, or configure a separate Docker network for Nginx to communicate with the services.

## Testing and Troubleshooting

-   **Verify Services**: After starting, check Docker logs to ensure all services are running without errors:
    ```bash
    docker-compose -f docker-compose.prod.yml logs
    ```
-   **Access Application**: Open your browser and navigate to `https://monitor.example.com` (replace with your domain). You should see the Argus Monitor frontend.
-   **Check API**: Verify that the API endpoints are accessible and functioning correctly.
-   **Common Issues**:
    *   **Port Conflicts**: Ensure no other services are using ports 80, 443, 3000, or 3001 on your host.
    *   **Firewall**: Check your server's firewall (e.g., `ufw`) to ensure ports 80 and 443 are open.
    *   **Environment Variables**: Double-check your `.env` file for any typos or incorrect values, especially `DATABASE_URL` and `REDIS_URL`.
    *   **Docker Network**: If services cannot communicate, inspect your Docker network configuration (`docker network ls`, `docker inspect <network_name>`).
    *   **SSL Issues**: If you encounter SSL errors, verify your Nginx configuration, certificate paths, and ensure your domain's DNS records are correctly pointing to your server.

## "Done when" criteria

The guide provides a clear and efficient path for a user to self-host Argus Monitor, covering all necessary steps from prerequisites to SSL configuration and troubleshooting.
