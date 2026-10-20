package service;

import model.AmortizationScheduleItem;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

public class EMICalculator {

    /**
     * Calculates monthly Equated Monthly Installment (EMI) using reducing balance formula:
     * EMI = [P * r * (1+r)^n] / [(1+r)^n - 1]
     *
     * @param principal  principal amount (P)
     * @param annualRate annual interest rate in percent (e.g., 8.5 for 8.5%)
     * @param months     total loan tenure in months (n)
     * @return calculated monthly EMI amount
     */
    public static double calculateEMI(double principal, double annualRate, int months) {
        if (principal <= 0 || months <= 0) {
            return 0.0;
        }

        if (annualRate <= 0.00001) {
            return principal / months;
        }

        double monthlyRate = (annualRate / 100.0) / 12.0; // r
        double factor = Math.pow(1.0 + monthlyRate, months); // (1+r)^n
        double emi = (principal * monthlyRate * factor) / (factor - 1.0);

        if (Double.isNaN(emi) || Double.isInfinite(emi)) {
            return 0.0;
        }
        return emi;
    }

    /**
     * Generates a complete month-by-month amortization schedule for a loan.
     *
     * @param principal  outstanding principal
     * @param annualRate annual interest rate %
     * @param months     tenure in months
     * @param startDate  start date of the schedule
     * @return list of installment rows
     */
    public static List<AmortizationScheduleItem> generateAmortizationSchedule(
            double principal, double annualRate, int months, LocalDate startDate) {

        List<AmortizationScheduleItem> schedule = new ArrayList<>();
        if (principal <= 0 || months <= 0) {
            return schedule;
        }

        double emi = calculateEMI(principal, annualRate, months);
        double monthlyRate = (annualRate / 100.0) / 12.0;
        double currentBalance = principal;
        LocalDate installmentDate = startDate != null ? startDate : LocalDate.now();

        for (int i = 1; i <= months && currentBalance > 0.001; i++) {
            double opening = currentBalance;
            double interest = opening * monthlyRate;
            double principalComponent = emi - interest;

            if (principalComponent > opening || i == months) {
                // Final adjustment
                principalComponent = opening;
                emi = principalComponent + interest;
            }

            double closing = Math.max(0.0, opening - principalComponent);

            schedule.add(new AmortizationScheduleItem(
                    i,
                    installmentDate,
                    opening,
                    emi,
                    principalComponent,
                    interest,
                    closing
            ));

            currentBalance = closing;
            installmentDate = installmentDate.plusMonths(1);
        }

        return schedule;
    }
}
