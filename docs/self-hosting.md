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
    `docker-compose.yml` is provided for local development and includes example services for PostgreSQL and Redis. For production, `docker-compose.prod.yml` is designed to be used with external PostgreSQL and Redis instances. If you wish to manage PostgreSQL and Redis with Docker Compose in production, you can adapt the relevant service definitions from `docker-compose.yml` into `docker-compose.prod.yml`, ensuring you configure appropriate volumes and strong passwords for production use.

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
    server {
        listen 80;
        server_name monitor.example.com;

        location / {
            return 301 https://$host$request_uri;
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

        # Rate limiting to prevent DoS attacks (configure as needed)
        # limit_req_zone $binary_remote_addr zone=mylimit:10m rate=5r/s;
        # limit_req zone=mylimit burst=10 nodelay;

        # Disable unnecessary HTTP methods
        # if ($request_method !~ ^(GET|POST|HEAD)$) {
        #     return 405;
        # }

        location /api/ {
            proxy_pass http://api-service:3001/; # Use Docker service name
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            # Basic Nginx caching for API responses (adjust as needed)
            # proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m inactive=60m;
            # proxy_cache_key "$scheme$request_method$host$request_uri";
            # proxy_cache api_cache;
            # proxy_cache_valid 200 302 10m;
            # proxy_cache_valid 404 1m;
        }

        location / {
            proxy_pass http://frontend-service:3000/; # Use Docker service name
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            # Basic Nginx caching for static assets (adjust as needed)
            # expires 1y;
            # add_header Cache-Control "public";
        }
    }
    ```
    **Note on `proxy_pass` targets**: When Nginx is running on the same host as your Docker Compose services, and Nginx is *not* part of the same Docker network, you might need to use `localhost` or the host's IP address if the Docker services are exposed on the host network. However, if Nginx is within the same Docker network (e.g., as another service in `docker-compose.prod.yml`), you should use the Docker service names (e.g., `http://api-service:3001`). The example above assumes Nginx is on the same host and can resolve Docker service names, or that you will adjust it to `localhost` if necessary.

3.  **Test Nginx Configuration**:
    ```bash
    sudo nginx -t
    ```

4.  **Reload Nginx**:
    ```bash
    sudo systemctl reload nginx
    ```

## Testing and Troubleshooting

-   **Verify Services**: Ensure all Docker containers are running: `docker-compose -f docker-compose.prod.yml ps`.
-   **Check Logs**: Use `docker-compose -f docker-compose.prod.yml logs -f` to view application logs for any errors.
-   **Network Connectivity**: Confirm your server's firewall allows incoming traffic on ports 80 and 443.
-   **Database/Redis Connectivity**: If services fail to start, double-check your `DATABASE_URL` and `REDIS_URL` in `.env` and ensure your database/Redis instances are running and accessible from the Docker containers.
-   **Performance Tuning**: For high-traffic deployments, consider optimizing your PostgreSQL and Redis configurations. Consult their respective documentation for performance tuning guides.
-   **Load Balancing**: For very high availability or traffic, consider deploying multiple instances of the API and frontend services behind a load balancer.

## "Done when" criteria

This guide aims to provide a clear, efficient, and secure path for users to self-host Argus Monitor.
