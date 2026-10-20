package ui;

import db.DBConnection;
import model.User;
import service.LoanService;

import javax.swing.*;
import javax.swing.border.CompoundBorder;
import javax.swing.border.EmptyBorder;
import javax.swing.border.LineBorder;
import java.awt.*;
import java.util.ArrayList;
import java.util.List;

public class MainFrame extends JFrame implements DashboardPanel.UserSelectionManager {

    private final LoanService loanService;
    private final List<UserChangeListener> listeners = new ArrayList<>();
    private User currentUser;

    private JLabel connectionStatusLabel;
    private JLabel currentUserBadge;

    private DashboardPanel dashboardPanel;
    private LoanPanel loanPanel;
    private OptimizerPanel optimizerPanel;
    private SchedulePanel schedulePanel;
    private AuditPanel auditPanel;

    public MainFrame() {
        super("LoanWise — Loan Prepayment and Payoff Optimizer");

        this.loanService = new LoanService();

        // Ensure database schema and seed data are initialized
        loanService.initializeDatabaseSchema();

        initComponents();
        setupInitialUser();

        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setSize(1280, 820);
        setMinimumSize(new Dimension(1024, 680));
        setLocationRelativeTo(null);
    }

    private void initComponents() {
        setLayout(new BorderLayout());

        // --- Top Header Bar ---
        JPanel topHeader = new JPanel(new BorderLayout());
        topHeader.setBackground(UITheme.BG_DARK);
        topHeader.setBorder(new EmptyBorder(14, 24, 14, 24));

        JPanel brandPanel = new JPanel(new FlowLayout(FlowLayout.LEFT, 12, 0));
        brandPanel.setOpaque(false);

        JLabel logoLabel = new JLabel("💰 LoanWise");
        logoLabel.setFont(new Font("SansSerif", Font.BOLD, 22));
        logoLabel.setForeground(Color.WHITE);

        JLabel tagLabel = new JLabel("|  Personal Debt Prepayment & Payoff Acceleration Engine");
        tagLabel.setFont(UITheme.FONT_REGULAR);
        tagLabel.setForeground(new Color(148, 163, 184));

        brandPanel.add(logoLabel);
        brandPanel.add(tagLabel);

        JPanel statusPanel = new JPanel(new FlowLayout(FlowLayout.RIGHT, 16, 0));
        statusPanel.setOpaque(false);

        boolean isDbConnected = DBConnection.getInstance().isConnected();
        connectionStatusLabel = new JLabel(isDbConnected ? "● DB Connected (MySQL)" : "○ DB Offline");
        connectionStatusLabel.setFont(UITheme.FONT_BOLD);
        connectionStatusLabel.setForeground(isDbConnected ? new Color(52, 211, 153) : new Color(248, 113, 113));

        currentUserBadge = new JLabel("User: None");
        currentUserBadge.setFont(UITheme.FONT_BOLD);
        currentUserBadge.setForeground(Color.WHITE);
        currentUserBadge.setBorder(new CompoundBorder(
                new LineBorder(new Color(51, 65, 85), 1, true),
                new EmptyBorder(4, 10, 4, 10)
        ));

        statusPanel.add(connectionStatusLabel);
        statusPanel.add(currentUserBadge);

        topHeader.add(brandPanel, BorderLayout.WEST);
        topHeader.add(statusPanel, BorderLayout.EAST);

        // --- Navigation Tabs ---
        JTabbedPane tabbedPane = new JTabbedPane();
        tabbedPane.setFont(new Font("SansSerif", Font.BOLD, 14));
        tabbedPane.setBackground(Color.WHITE);

        dashboardPanel = new DashboardPanel(loanService, this);
        loanPanel = new LoanPanel(loanService, this);
        optimizerPanel = new OptimizerPanel(loanService, this);
        schedulePanel = new SchedulePanel(loanService, this);
        auditPanel = new AuditPanel(loanService);

        tabbedPane.addTab("📊 Portfolio Dashboard", dashboardPanel);
        tabbedPane.addTab("💳 Loan Accounts", loanPanel);
        tabbedPane.addTab("⚡ Prepayment Optimizer", optimizerPanel);
        tabbedPane.addTab("📅 Amortization Schedule", schedulePanel);
        tabbedPane.addTab("📜 Audit Ledger", auditPanel);

        // Listen for tab switches to auto-refresh current views
        tabbedPane.addChangeListener(e -> {
            int selectedIndex = tabbedPane.getSelectedIndex();
            switch (selectedIndex) {
                case 0 -> dashboardPanel.refreshData(currentUser);
                case 1 -> loanPanel.refreshLoans();
                case 2 -> optimizerPanel.updatePriorityTablePreview();
                case 3 -> schedulePanel.populateLoanSelector(currentUser);
                case 4 -> auditPanel.refreshAuditLogs();
            }
        });

        add(topHeader, BorderLayout.NORTH);
        add(tabbedPane, BorderLayout.CENTER);
    }

    private void setupInitialUser() {
        List<User> users = loanService.getAllUsers();
        if (!users.isEmpty()) {
            selectUser(users.get(0));
        }
    }

    @Override
    public User getCurrentUser() {
        return currentUser;
    }

    @Override
    public void selectUser(User user) {
        this.currentUser = user;
        if (user != null) {
            currentUserBadge.setText("Active: " + user.getFullName());
        } else {
            currentUserBadge.setText("Active: None");
        }

        for (UserChangeListener listener : listeners) {
            listener.onUserChanged(user);
        }
    }

    @Override
    public void registerListener(UserChangeListener listener) {
        if (listener != null && !listeners.contains(listener)) {
            listeners.add(listener);
        }
    }

    public static void main(String[] args) {
        // Apply modern Look & Feel
        try {
            for (UIManager.LookAndFeelInfo info : UIManager.getInstalledLookAndFeels()) {
                if ("Nimbus".equals(info.getName())) {
                    UIManager.setLookAndFeel(info.getClassName());
                    break;
                }
            }
        } catch (Exception e) {
            try {
                UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
            } catch (Exception ignored) {
            }
        }

        SwingUtilities.invokeLater(() -> {
            MainFrame frame = new MainFrame();
            frame.setVisible(true);
        });
    }
}
