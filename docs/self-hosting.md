# Self-Hosting Argus Monitor

This guide will walk you through the process of self-hosting Argus Monitor.

## Prerequisites
- Docker and Docker Compose installed
- Sufficient system resources (CPU, RAM, Disk Space). For a small deployment (e.g., 1-5 monitors), a VPS with 2 vCPU and 4GB RAM is a good starting point. Scale up as needed for larger numbers of monitors or checks.
- A PostgreSQL database instance (can be run via Docker Compose or externally).
- A Redis instance (can be run via Docker Compose or externally).
- A domain name configured to point to your server's IP address (for SSL).

## Setup Steps

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
    We provide `docker-compose.yml` for local development, which includes example services for PostgreSQL and Redis.
    `docker-compose.prod.yml` is designed for production environments and assumes you will provide your own external PostgreSQL and Redis instances. If you prefer to manage PostgreSQL and Redis with Docker Compose in production, you can modify `docker-compose.prod.yml` to include these services from `docker-compose.yml`. Remember to set appropriate volumes and strong passwords for production use.

4.  **Run Migrations and Build Services** (using `docker-compose.prod.yml`):
    Ensure your database and Redis are accessible and properly secured. Then, run the migrations and build the services.
    ```bash
    docker-compose -f docker-compose.prod.yml run --rm api-service npx prisma migrate deploy
    docker-compose -f docker-compose.prod.yml build
    ```
    **Troubleshooting Migrations**: If `prisma migrate deploy` fails, check your `DATABASE_URL` in `.env` for correctness, ensure your PostgreSQL database is running and accessible (e.g., check firewall rules, database service status), and verify credentials. Review the output for specific error messages.

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
        # This example limits requests to 1 per second, with a burst of 5, for the /api endpoint.
        # Adjust 'zone=one:10m' and 'rate=1r/s' based on your expected traffic.
        limit_req_zone $binary_remote_addr zone=api_rate_limit:10m rate=1r/s;

        # Disable unnecessary HTTP methods (e.g., only allow GET, POST, HEAD)
        if ($request_method !~ ^(GET|POST|HEAD)$) {
            return 405; # Method Not Allowed
        }

        location / {
            # Use Docker service names for proxy_pass if Nginx is on the same host as Docker Compose
            # The API should ONLY be accessible via the reverse proxy in production.
            proxy_pass http://frontend-service:3000; # Replace with your frontend service name and port
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
            # Basic caching for static assets (adjust as needed)
            expires 1d;
            add_header Cache-Control "public, max-age=86400";
        }

        location /api {
            limit_req zone=api_rate_limit burst=5 nodelay; # Apply rate limiting
            # Use Docker service names for proxy_pass if Nginx is on the same host as Docker Compose
            # The API should ONLY be accessible via the reverse proxy in production.
            proxy_pass http://api-service:3001; # Replace with your API service name and port
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
    ```
    **Note on `proxy_pass` targets**: If Nginx is running on the same host as your Docker Compose services, you should use the Docker service names (e.g., `http://frontend-service:3000`) rather than `localhost`. You can find the service names in your `docker-compose.prod.yml` file.

3.  **Obtain SSL Certificates**: Use Certbot or another method to obtain and install SSL certificates for your domain.
    ```bash
    sudo certbot --nginx -d monitor.example.com
    ```

4.  **Test Nginx Configuration**:
    ```bash
    sudo nginx -t
    sudo systemctl reload nginx
    ```

## Testing and Troubleshooting

-   **Verify Services**: Check Docker logs to ensure all services are running without errors:
    ```bash
    docker-compose -f docker-compose.prod.yml logs
    ```
-   **Check Connectivity**: Ensure you can access the Argus Monitor frontend in your browser at your configured domain.
-   **Common Issues**:
    *   **Firewall**: Ensure ports 80 and 443 are open on your server.
    *   **Environment Variables**: Double-check your `.env` file for any typos or incorrect values.
    *   **Database/Redis Connectivity**: Verify that your Argus Monitor services can connect to your PostgreSQL and Redis instances. Check credentials, hostnames, and port numbers.
    *   **Nginx Configuration**: Use `sudo nginx -t` to check for syntax errors and `sudo systemctl status nginx` to ensure Nginx is running.

## "Done when" criteria

This guide aims to provide a clear and efficient path for a user to self-host Argus Monitor. A user should be able to follow these instructions to successfully deploy the application.

## Performance Considerations

-   **Resource Allocation**: As the number of monitors and checks increases, you may need to scale up your server's CPU, RAM, and disk resources.
-   **Nginx Caching**: The provided Nginx configuration includes basic caching for static assets. For higher traffic, consider more advanced caching strategies.
-   **Load Balancing**: For very high availability or large-scale deployments, consider setting up multiple instances of the API and frontend services behind a load balancer.
-   **Database/Redis Tuning**: If you experience performance bottlenecks, investigate performance tuning options for your PostgreSQL and Redis instances.
