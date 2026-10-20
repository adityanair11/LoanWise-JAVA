package dao;

import db.DBConnection;
import model.User;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

public class UserDAO {

    public List<User> findAll() {
        List<User> users = new ArrayList<>();
        String sql = "SELECT user_id, full_name, email, monthly_income FROM user_account ORDER BY user_id ASC";

        try {
            Connection conn = DBConnection.getInstance().getConnection();
            try (PreparedStatement stmt = conn.prepareStatement(sql);
                 ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    User user = new User(
                            rs.getInt("user_id"),
                            rs.getString("full_name"),
                            rs.getString("email"),
                            rs.getDouble("monthly_income")
                    );
                    users.add(user);
                }
            }
        } catch (SQLException e) {
            System.err.println("[UserDAO] Error in findAll: " + e.getMessage());
        }
        return users;
    }

    public User findById(int userId) {
        String sql = "SELECT user_id, full_name, email, monthly_income FROM user_account WHERE user_id = ?";

        try {
            Connection conn = DBConnection.getInstance().getConnection();
            try (PreparedStatement stmt = conn.prepareStatement(sql)) {
                stmt.setInt(1, userId);
                try (ResultSet rs = stmt.executeQuery()) {
                    if (rs.next()) {
                        return new User(
                                rs.getInt("user_id"),
                                rs.getString("full_name"),
                                rs.getString("email"),
                                rs.getDouble("monthly_income")
                        );
                    }
                }
            }
        } catch (SQLException e) {
            System.err.println("[UserDAO] Error in findById: " + e.getMessage());
        }
        return null;
    }

    public boolean insert(User user) {
        String sql = "INSERT INTO user_account (full_name, email, monthly_income) VALUES (?, ?, ?)";

        try {
            Connection conn = DBConnection.getInstance().getConnection();
            try (PreparedStatement stmt = conn.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
                stmt.setString(1, user.getFullName());
                stmt.setString(2, user.getEmail());
                stmt.setDouble(3, user.getMonthlyIncome());

                int affected = stmt.executeUpdate();
                if (affected > 0) {
                    try (ResultSet generatedKeys = stmt.getGeneratedKeys()) {
                        if (generatedKeys.next()) {
                            user.setUserId(generatedKeys.getInt(1));
                        }
                    }
                    return true;
                }
            }
        } catch (SQLException e) {
            System.err.println("[UserDAO] Error in insert: " + e.getMessage());
        }
        return false;
    }
}
