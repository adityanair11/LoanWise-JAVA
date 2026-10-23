package ui;

import javax.swing.*;
import javax.swing.border.Border;
import javax.swing.border.CompoundBorder;
import javax.swing.border.EmptyBorder;
import javax.swing.border.LineBorder;
import java.awt.*;
import java.text.DecimalFormat;

/**
 * Design system tokens and styling primitives for the LoanWise desktop application.
 * Professional fintech theme inspired by Linear and Stripe (Deep Indigo / Slate / Emerald).
 */
public class UITheme {

    // Primary palette
    public static final Color BG_DARK = new Color(15, 23, 42);          // Slate 900
    public static final Color BG_HEADER = new Color(11, 15, 25);        // Deep Obsidian
    public static final Color BG_LIGHT = new Color(248, 250, 252);      // Slate 50
    public static final Color BG_SUBTLE = new Color(241, 245, 249);     // Slate 100
    public static final Color CARD_BG = Color.WHITE;

    // Typography colors
    public static final Color TEXT_MAIN = new Color(15, 23, 42);        // Slate 900
    public static final Color TEXT_MUTED = new Color(100, 116, 139);    // Slate 500
    public static final Color TEXT_TERTIARY = new Color(148, 163, 184); // Slate 400

    // Accents & status
    public static final Color ACCENT_BLUE = new Color(59, 130, 246);    // Blue 500
    public static final Color ACCENT_INDIGO = new Color(79, 70, 229);   // Indigo 600 (Primary action)
    public static final Color ACCENT_GREEN = new Color(16, 185, 129);   // Emerald 500
    public static final Color ACCENT_ORANGE = new Color(245, 158, 11);  // Amber 500
    public static final Color ACCENT_RED = new Color(239, 68, 68);      // Red 500
    public static final Color BORDER_COLOR = new Color(226, 232, 240);  // Slate 200
    public static final Color BORDER_SUBTLE = new Color(241, 245, 249); // Slate 100

    // Soft backgrounds for pills and badges
    public static final Color PILL_GREEN_BG = new Color(236, 253, 245); // Emerald 50
    public static final Color PILL_ORANGE_BG = new Color(255, 251, 235);// Amber 50
    public static final Color PILL_RED_BG = new Color(254, 242, 242);   // Red 50
    public static final Color PILL_BLUE_BG = new Color(239, 246, 255);  // Blue 50
    public static final Color PILL_SLATE_BG = new Color(241, 245, 249); // Slate 100

    // High quality cross-platform typography
    public static final Font FONT_DISPLAY = new Font(Font.SANS_SERIF, Font.BOLD, 24);
    public static final Font FONT_TITLE = new Font(Font.SANS_SERIF, Font.BOLD, 20);
    public static final Font FONT_HEADER = new Font(Font.SANS_SERIF, Font.BOLD, 15);
    public static final Font FONT_TAB = new Font(Font.SANS_SERIF, Font.BOLD, 13);
    public static final Font FONT_BOLD = new Font(Font.SANS_SERIF, Font.BOLD, 13);
    public static final Font FONT_REGULAR = new Font(Font.SANS_SERIF, Font.PLAIN, 13);
    public static final Font FONT_SMALL = new Font(Font.SANS_SERIF, Font.PLAIN, 11);
    public static final Font FONT_SMALL_BOLD = new Font(Font.SANS_SERIF, Font.BOLD, 11);
    public static final Font FONT_KPI_VAL = new Font(Font.SANS_SERIF, Font.BOLD, 22);

    private static final DecimalFormat CURRENCY_FORMAT = new DecimalFormat("₹#,##,##0.00");
    private static final DecimalFormat INTEGER_FORMAT = new DecimalFormat("#,##0");

    public static String formatCurrency(double amount) {
        return CURRENCY_FORMAT.format(amount);
    }

    public static String formatInteger(long value) {
        return INTEGER_FORMAT.format(value);
    }

    public static Border createCardBorder() {
        return new CompoundBorder(
                new LineBorder(BORDER_COLOR, 1, true),
                new EmptyBorder(16, 20, 16, 20)
        );
    }

    public static Border createKpiCardBorder() {
        return new CompoundBorder(
                new LineBorder(BORDER_COLOR, 1, true),
                new EmptyBorder(14, 16, 14, 16)
        );
    }

    public static Border createPillBorder(Color borderColor) {
        return new CompoundBorder(
                new LineBorder(borderColor, 1, true),
                new EmptyBorder(4, 10, 4, 10)
        );
    }

    public static JButton createStyledButton(String text, Color background, Color foreground) {
        JButton button = new JButton(text);
        button.setBackground(background);
        button.setForeground(foreground);
        button.setFocusPainted(false);
        button.setFont(FONT_BOLD);
        button.setCursor(new Cursor(Cursor.HAND_CURSOR));
        button.putClientProperty("JButton.buttonType", "roundRect");
        button.setBorder(new CompoundBorder(
                new LineBorder(background.darker(), 1, true),
                new EmptyBorder(8, 16, 8, 16)
        ));
        button.setOpaque(true);
        return button;
    }

    public static JButton createSecondaryButton(String text) {
        JButton button = new JButton(text);
        button.setBackground(Color.WHITE);
        button.setForeground(TEXT_MAIN);
        button.setFocusPainted(false);
        button.setFont(FONT_BOLD);
        button.setCursor(new Cursor(Cursor.HAND_CURSOR));
        button.putClientProperty("JButton.buttonType", "roundRect");
        button.setBorder(new CompoundBorder(
                new LineBorder(BORDER_COLOR, 1, true),
                new EmptyBorder(8, 14, 8, 14)
        ));
        button.setOpaque(true);
        return button;
    }
}
