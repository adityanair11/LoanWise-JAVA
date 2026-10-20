package db;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;

public class DBConnection {

    private static final String HOST = "localhost";
    private static final int PORT = 3306;
    private static final String DATABASE = "loanwise";
    private static final String USERNAME = "root";
    private static final String PASSWORD = "Adi@0917";

    private static final String SERVER_URL = "jdbc:mysql://" + HOST + ":" + PORT +
            "/?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC";
    private static final String DB_URL = "jdbc:mysql://" + HOST + ":" + PORT + "/" + DATABASE +
            "?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC";

    private static volatile DBConnection instance;
    private Connection connection;

    private DBConnection() {
        try {
            Class.forName("com.mysql.cj.jdbc.Driver");
        } catch (ClassNotFoundException e) {
            System.err.println("[DBConnection] MySQL JDBC Driver not found in classpath: " + e.getMessage());
        }
    }

    public static DBConnection getInstance() {
        if (instance == null) {
            synchronized (DBConnection.class) {
                if (instance == null) {
                    instance = new DBConnection();
                }
            }
        }
        return instance;
    }

    /**
     * Obtains the shared database connection, reconnecting if closed or invalid.
     *
     * @return active java.sql.Connection
     * @throws SQLException if a database access error occurs
     */
    public synchronized Connection getConnection() throws SQLException {
        if (connection == null || connection.isClosed() || !connection.isValid(2)) {
            try {
                connection = DriverManager.getConnection(DB_URL, USERNAME, PASSWORD);
            } catch (SQLException e) {
                // If database might not exist yet, attempt creating it first
                if (e.getErrorCode() == 1049 || (e.getMessage() != null && e.getMessage().contains("Unknown database"))) {
                    ensureDatabaseExists();
                    connection = DriverManager.getConnection(DB_URL, USERNAME, PASSWORD);
                } else {
                    throw e;
                }
            }
        }
        return connection;
    }

    /**
     * Checks if connection is currently active.
     */
    public synchronized boolean isConnected() {
        try {
            return connection != null && !connection.isClosed() && connection.isValid(2);
        } catch (SQLException e) {
            return false;
        }
    }

    /**
     * Ensures that the 'loanwise' database exists on the MySQL server.
     */
    public synchronized void ensureDatabaseExists() {
        try (Connection rootConn = DriverManager.getConnection(SERVER_URL, USERNAME, PASSWORD);
             Statement stmt = rootConn.createStatement()) {
            stmt.executeUpdate("CREATE DATABASE IF NOT EXISTS " + DATABASE);
            System.out.println("[DBConnection] Database '" + DATABASE + "' verified or created successfully.");
        } catch (SQLException e) {
            System.err.println("[DBConnection] Could not verify/create database: " + e.getMessage());
        }
    }

    /**
     * Safely closes the shared connection.
     */
    public synchronized void closeConnection() {
        if (connection != null) {
            try {
                if (!connection.isClosed()) {
                    connection.close();
                }
            } catch (SQLException e) {
                System.err.println("[DBConnection] Error closing connection: " + e.getMessage());
            } finally {
                connection = null;
            }
        }
    }
}
