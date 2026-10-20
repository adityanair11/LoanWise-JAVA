import exception.InvalidPrepaymentException;
import model.Loan;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import service.EMICalculator;
import service.SimulationThread;
import strategy.AvalancheStrategy;
import strategy.SnowballStrategy;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

public class LoanWiseTest {

    @Test
    @DisplayName("Verify reducing balance EMI calculation formula")
    public void testEMICalculator() {
        // Principal = 1,00,000, Annual Rate = 12%, Tenure = 12 months
        // Monthly Rate = 1%
        // EMI = [100000 * 0.01 * (1.01)^12] / [(1.01)^12 - 1] = ~8884.88
        double emi = EMICalculator.calculateEMI(100000.0, 12.0, 12);
        assertTrue(emi > 8880 && emi < 8890, "Calculated EMI should be approx 8884.88, got: " + emi);

        // Edge case: 0% rate
        double zeroRateEmi = EMICalculator.calculateEMI(120000.0, 0.0, 12);
        assertEquals(10000.0, zeroRateEmi, 0.01);

        // Edge case: invalid params
        assertEquals(0.0, EMICalculator.calculateEMI(0.0, 10.0, 12));
        assertEquals(0.0, EMICalculator.calculateEMI(100000.0, 10.0, 0));
    }

    @Test
    @DisplayName("Verify Avalanche Strategy prioritizes highest interest rate loans first")
    public void testAvalancheStrategy() {
        AvalancheStrategy strategy = new AvalancheStrategy();
        List<Loan> loans = new ArrayList<>();

        Loan l1 = new Loan(1, 1, "Home Loan", "HDFC", "HOME", 4000000, 3800000, 8.5, "REDUCING", 240, LocalDate.now(), 5, "ACTIVE");
        Loan l2 = new Loan(2, 1, "Personal Loan", "SBI", "PERSONAL", 300000, 200000, 13.5, "REDUCING", 36, LocalDate.now(), 5, "ACTIVE");
        Loan l3 = new Loan(3, 1, "Car Loan", "ICICI", "AUTO", 800000, 500000, 9.2, "REDUCING", 60, LocalDate.now(), 5, "ACTIVE");

        loans.add(l1);
        loans.add(l2);
        loans.add(l3);

        List<Loan> sorted = strategy.sortLoans(loans);
        assertEquals(3, sorted.size());
        assertEquals("Personal Loan", sorted.get(0).getLoanName(), "Personal loan with 13.5% should be prioritized first");
        assertEquals("Car Loan", sorted.get(1).getLoanName(), "Car loan with 9.2% should be second");
        assertEquals("Home Loan", sorted.get(2).getLoanName(), "Home loan with 8.5% should be third");
    }

    @Test
    @DisplayName("Verify Snowball Strategy prioritizes smallest balance loans first")
    public void testSnowballStrategy() {
        SnowballStrategy strategy = new SnowballStrategy();
        List<Loan> loans = new ArrayList<>();

        Loan l1 = new Loan(1, 1, "Home Loan", "HDFC", "HOME", 4000000, 3800000, 8.5, "REDUCING", 240, LocalDate.now(), 5, "ACTIVE");
        Loan l2 = new Loan(2, 1, "Personal Loan", "SBI", "PERSONAL", 300000, 200000, 13.5, "REDUCING", 36, LocalDate.now(), 5, "ACTIVE");
        Loan l3 = new Loan(3, 1, "Car Loan", "ICICI", "AUTO", 800000, 500000, 9.2, "REDUCING", 60, LocalDate.now(), 5, "ACTIVE");

        loans.add(l1);
        loans.add(l2);
        loans.add(l3);

        List<Loan> sorted = strategy.sortLoans(loans);
        assertEquals(3, sorted.size());
        assertEquals("Personal Loan", sorted.get(0).getLoanName(), "Loan with smallest balance (2,00,000) should be prioritized first");
        assertEquals("Car Loan", sorted.get(1).getLoanName(), "Loan with balance 5,00,000 should be second");
        assertEquals("Home Loan", sorted.get(2).getLoanName(), "Loan with balance 38,00,000 should be third");
    }

    @Test
    @DisplayName("Verify SimulationThread calculates interest savings and months saved asynchronously")
    public void testSimulationThread() throws InterruptedException {
        List<Loan> loans = new ArrayList<>();
        loans.add(new Loan(1, 1, "Personal Loan", "SBI", "PERSONAL", 200000, 200000, 12.0, "REDUCING", 24, LocalDate.now(), 5, "ACTIVE"));
        loans.add(new Loan(2, 1, "Car Loan", "ICICI", "AUTO", 500000, 500000, 9.5, "REDUCING", 48, LocalDate.now(), 5, "ACTIVE"));

        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<SimulationThread.SimulationResult> resultRef = new AtomicReference<>();
        AtomicBoolean failed = new AtomicBoolean(false);

        SimulationThread.SimulationCallback callback = new SimulationThread.SimulationCallback() {
            @Override
            public void onSimulationStarted() {}

            @Override
            public void onSimulationProgress(int percent) {}

            @Override
            public void onSimulationCompleted(SimulationThread.SimulationResult result) {
                resultRef.set(result);
                latch.countDown();
            }

            @Override
            public void onSimulationFailed(String message) {
                failed.set(true);
                latch.countDown();
            }
        };

        // Simulate with ₹10,000 extra monthly prepayment
        SimulationThread thread = new SimulationThread(loans, new AvalancheStrategy(), 10000.0, callback);
        Thread t = new Thread(thread);
        t.start();

        assertTrue(latch.await(5, TimeUnit.SECONDS), "Simulation should complete within 5 seconds");
        assertFalse(failed.get(), "Simulation should not report failure");
        assertNotNull(resultRef.get(), "Simulation result must not be null");

        SimulationThread.SimulationResult result = resultRef.get();
        assertTrue(result.getInterestSaved() > 0, "Extra prepayments should produce positive interest savings");
        assertTrue(result.getMonthsSaved() > 0, "Extra prepayments should reduce loan tenure");
        assertTrue(result.getAcceleratedMonths() < result.getBaselineMonths(), "Accelerated months must be strictly less than baseline months");
    }

    @Test
    @DisplayName("Verify BCrypt password hashing and authentication logic")
    public void testBCryptAuthentication() {
        String rawPassword = "Password@123";
        String hashed = org.mindrot.jbcrypt.BCrypt.hashpw(rawPassword, org.mindrot.jbcrypt.BCrypt.gensalt(10));

        assertNotNull(hashed);
        assertTrue(org.mindrot.jbcrypt.BCrypt.checkpw(rawPassword, hashed), "Valid password must verify against hash");
        assertFalse(org.mindrot.jbcrypt.BCrypt.checkpw("WrongPassword", hashed), "Incorrect password must not match hash");
    }

    @Test
    @DisplayName("Verify InvalidPrepaymentException creation and payload")
    public void testInvalidPrepaymentException() {
        InvalidPrepaymentException ex = new InvalidPrepaymentException("Test prepayment exception", 50000.0, 20000.0);
        assertEquals(50000.0, ex.getAttemptedAmount());
        assertEquals(20000.0, ex.getCurrentBalance());
        assertTrue(ex.getMessage().contains("50000.00"));
    }
}
