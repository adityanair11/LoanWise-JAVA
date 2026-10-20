package model;

public class User {
    private int userId;
    private String fullName;
    private String email;
    private double monthlyIncome;

    public User() {
    }

    public User(int userId, String fullName, String email, double monthlyIncome) {
        this.userId = userId;
        this.fullName = fullName;
        this.email = email;
        this.monthlyIncome = monthlyIncome;
    }

    public User(String fullName, String email, double monthlyIncome) {
        this.fullName = fullName;
        this.email = email;
        this.monthlyIncome = monthlyIncome;
    }

    public int getUserId() {
        return userId;
    }

    public void setUserId(int userId) {
        this.userId = userId;
    }

    public String getFullName() {
        return fullName;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public double getMonthlyIncome() {
        return monthlyIncome;
    }

    public void setMonthlyIncome(double monthlyIncome) {
        this.monthlyIncome = monthlyIncome;
    }

    @Override
    public String toString() {
        return fullName + " (" + email + ")";
    }
}
