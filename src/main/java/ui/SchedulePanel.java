package ui;

import model.AmortizationScheduleItem;
import model.Loan;
import model.User;
import service.EMICalculator;
import service.LoanService;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import javax.swing.border.LineBorder;
import javax.swing.filechooser.FileNameExtensionFilter;
import javax.swing.table.DefaultTableCellRenderer;
import javax.swing.table.DefaultTableModel;
import java.awt.*;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

public class SchedulePanel extends JPanel implements UserChangeListener {

    private final LoanService loanService;
    private final DashboardPanel.UserSelectionManager selectionManager;

    private JComboBox<Loan> loanSelector;
    private JTable scheduleTable;
    private DefaultTableModel tableModel;
    private List<AmortizationScheduleItem> currentSchedule = new ArrayList<>();

    private JLabel summaryLabel;
    private JButton exportCsvBtn;

    public SchedulePanel(LoanService loanService, DashboardPanel.UserSelectionManager selectionManager) {
        this.loanService = loanService;
        this.selectionManager = selectionManager;

        setLayout(new BorderLayout(16, 16));
        setBackground(UITheme.BG_LIGHT);
        setBorder(new EmptyBorder(20, 24, 20, 24));

        initComponents();
        selectionManager.registerListener(this);
    }

    private void initComponents() {
        // Top Bar
        JPanel topBar = new JPanel(new BorderLayout());
        topBar.setOpaque(false);

        JPanel titlePanel = new JPanel(new GridLayout(2, 1, 0, 4));
        titlePanel.setOpaque(false);

        JLabel title = new JLabel("Amortization Schedule & Projection");
        title.setFont(UITheme.FONT_TITLE);
        title.setForeground(UITheme.TEXT_MAIN);

        JLabel subtitle = new JLabel("Installment-by-installment reducing-balance principal vs interest breakdown");
        subtitle.setFont(UITheme.FONT_REGULAR);
        subtitle.setForeground(UITheme.TEXT_MUTED);

        titlePanel.add(title);
        titlePanel.add(subtitle);

        JPanel actions = new JPanel(new FlowLayout(FlowLayout.RIGHT, 10, 0));
        actions.setOpaque(false);

        JLabel selectLabel = new JLabel("Select Loan Account:");
        selectLabel.setFont(UITheme.FONT_BOLD);
        selectLabel.setForeground(UITheme.TEXT_MAIN);

        loanSelector = new JComboBox<>();
        loanSelector.setFont(UITheme.FONT_REGULAR);
        loanSelector.setBackground(Color.WHITE);
        loanSelector.setPreferredSize(new Dimension(320, 36));

        loanSelector.addActionListener(e -> generateAndDisplaySchedule());

        exportCsvBtn = UITheme.createStyledButton("Export to CSV", UITheme.ACCENT_GREEN, Color.WHITE);
        exportCsvBtn.addActionListener(e -> exportScheduleToCsv());

        actions.add(selectLabel);
        actions.add(loanSelector);
        actions.add(exportCsvBtn);

        topBar.add(titlePanel, BorderLayout.WEST);
        topBar.add(actions, BorderLayout.EAST);

        // Center Table Card
        JPanel tableCard = new JPanel(new BorderLayout(0, 10));
        tableCard.setBackground(UITheme.CARD_BG);
        tableCard.setBorder(UITheme.createCardBorder());

        String[] cols = {
                "Inst. #", "Due Date", "Opening Balance (₹)",
                "EMI (₹)", "Principal Paid (₹)", "Interest Paid (₹)", "Closing Balance (₹)"
        };

        tableModel = new DefaultTableModel(cols, 0) {
            @Override
            public boolean isCellEditable(int r, int c) { return false; }
        };

        scheduleTable = new JTable(tableModel);
        scheduleTable.setRowHeight(30);
        scheduleTable.setFont(UITheme.FONT_REGULAR);
        scheduleTable.getTableHeader().setFont(UITheme.FONT_BOLD);
        scheduleTable.getTableHeader().setBackground(new Color(241, 245, 249));
        scheduleTable.setSelectionBackground(new Color(219, 234, 254));
        scheduleTable.setGridColor(UITheme.BORDER_COLOR);

        DefaultTableCellRenderer rightRenderer = new DefaultTableCellRenderer();
        rightRenderer.setHorizontalAlignment(SwingConstants.RIGHT);
        for (int i = 2; i <= 6; i++) {
            scheduleTable.getColumnModel().getColumn(i).setCellRenderer(rightRenderer);
        }

        JScrollPane scrollPane = new JScrollPane(scheduleTable);
        scrollPane.setBorder(new LineBorder(UITheme.BORDER_COLOR, 1));

        // Bottom Summary Bar
        summaryLabel = new JLabel("Select a loan to view amortization timeline.");
        summaryLabel.setFont(UITheme.FONT_BOLD);
        summaryLabel.setForeground(UITheme.TEXT_MAIN);
        summaryLabel.setBorder(new EmptyBorder(8, 4, 4, 4));

        tableCard.add(scrollPane, BorderLayout.CENTER);
        tableCard.add(summaryLabel, BorderLayout.SOUTH);

        add(topBar, BorderLayout.NORTH);
        add(tableCard, BorderLayout.CENTER);
    }

    @Override
    public void onUserChanged(User newUser) {
        populateLoanSelector(newUser);
    }

    public void populateLoanSelector(User user) {
        loanSelector.removeAllItems();
        if (user == null) {
            tableModel.setRowCount(0);
            summaryLabel.setText("No active user profile selected.");
            return;
        }

        List<Loan> loans = loanService.getActiveLoansByUserId(user.getUserId());
        for (Loan l : loans) {
            loanSelector.addItem(l);
        }

        if (loans.isEmpty()) {
            tableModel.setRowCount(0);
            summaryLabel.setText("No active loans found for " + user.getFullName());
        } else {
            loanSelector.setSelectedIndex(0);
        }
    }

    private void generateAndDisplaySchedule() {
        Loan selectedLoan = (Loan) loanSelector.getSelectedItem();
        tableModel.setRowCount(0);
        currentSchedule.clear();

        if (selectedLoan == null) {
            summaryLabel.setText("Please select a loan.");
            return;
        }

        LocalDate start = selectedLoan.getStartDate() != null ? selectedLoan.getStartDate() : LocalDate.now();
        int tenure = selectedLoan.getTenureMonths() > 0 ? selectedLoan.getTenureMonths() : 12;
        double balance = selectedLoan.getOutstandingBalance() > 0 ? selectedLoan.getOutstandingBalance() : selectedLoan.getPrincipalAmount();

        currentSchedule = EMICalculator.generateAmortizationSchedule(
                balance,
                selectedLoan.getAnnualInterestRate(),
                tenure,
                start
        );

        double totalInterest = 0.0;
        double totalPaid = 0.0;

        for (AmortizationScheduleItem item : currentSchedule) {
            totalInterest += item.getInterestPaid();
            totalPaid += item.getEmi();

            tableModel.addRow(new Object[]{
                    "#" + item.getInstallmentNumber(),
                    item.getPaymentDate().toString(),
                    UITheme.formatCurrency(item.getOpeningBalance()),
                    UITheme.formatCurrency(item.getEmi()),
                    UITheme.formatCurrency(item.getPrincipalPaid()),
                    UITheme.formatCurrency(item.getInterestPaid()),
                    UITheme.formatCurrency(item.getClosingBalance())
            });
        }

        summaryLabel.setText("Total Schedule Summary:  Principal: " +
                UITheme.formatCurrency(balance) + "  |  Cumulative Interest: " +
                UITheme.formatCurrency(totalInterest) + "  |  Total Lifetime Outflow: " +
                UITheme.formatCurrency(totalPaid) + " across " + currentSchedule.size() + " installments");
    }

    private void exportScheduleToCsv() {
        if (currentSchedule.isEmpty()) {
            JOptionPane.showMessageDialog(this, "No amortization schedule available to export.", "Empty Schedule", JOptionPane.WARNING_MESSAGE);
            return;
        }

        Loan selectedLoan = (Loan) loanSelector.getSelectedItem();
        String defaultFileName = (selectedLoan != null ?
                selectedLoan.getLoanName().replaceAll("[^a-zA-Z0-9_-]", "_") : "Amortization") + "_Schedule.csv";

        JFileChooser fileChooser = new JFileChooser();
        fileChooser.setDialogTitle("Save Amortization Schedule to CSV");
        fileChooser.setSelectedFile(new File(defaultFileName));
        fileChooser.setFileFilter(new FileNameExtensionFilter("CSV Files (*.csv)", "csv"));

        int userSelection = fileChooser.showSaveDialog(this);
        if (userSelection == JFileChooser.APPROVE_OPTION) {
            File fileToSave = fileChooser.getSelectedFile();
            if (!fileToSave.getName().toLowerCase().endsWith(".csv")) {
                fileToSave = new File(fileToSave.getAbsolutePath() + ".csv");
            }

            try (BufferedWriter writer = new BufferedWriter(new FileWriter(fileToSave))) {
                writer.write("Installment Number,Due Date,Opening Balance,EMI,Principal Paid,Interest Paid,Closing Balance");
                writer.newLine();

                for (AmortizationScheduleItem item : currentSchedule) {
                    writer.write(String.format("%d,%s,%.2f,%.2f,%.2f,%.2f,%.2f",
                            item.getInstallmentNumber(),
                            item.getPaymentDate(),
                            item.getOpeningBalance(),
                            item.getEmi(),
                            item.getPrincipalPaid(),
                            item.getInterestPaid(),
                            item.getClosingBalance()
                    ));
                    writer.newLine();
                }

                JOptionPane.showMessageDialog(this, "Schedule exported successfully to:\n" + fileToSave.getAbsolutePath(), "Export Complete", JOptionPane.INFORMATION_MESSAGE);
            } catch (IOException ex) {
                JOptionPane.showMessageDialog(this, "Error exporting CSV: " + ex.getMessage(), "File Error", JOptionPane.ERROR_MESSAGE);
            }
        }
    }
}
