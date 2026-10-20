-- =====================================================================
-- LoanWise Database Schema and Initial Seed Data
-- =====================================================================

CREATE DATABASE IF NOT EXISTS loanwise;
USE loanwise;

-- 1. User Account Table
CREATE TABLE IF NOT EXISTS user_account (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    monthly_income DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. Loan Table
CREATE TABLE IF NOT EXISTS loan (
    loan_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    loan_name VARCHAR(100) NOT NULL,
    lender_name VARCHAR(100) NOT NULL,
    loan_type ENUM('HOME','AUTO','PERSONAL','EDUCATION','OTHER') NOT NULL DEFAULT 'OTHER',
    principal_amount DECIMAL(14,2) NOT NULL,
    outstanding_balance DECIMAL(14,2) NOT NULL,
    annual_interest_rate DECIMAL(6,3) NOT NULL,
    annual_rate_type ENUM('FIXED','FLOATING') NOT NULL DEFAULT 'FIXED',
    annual_rate_start_date DATE NOT NULL,
    tenure_months INT NOT NULL,
    start_date DATE NOT NULL,
    due_day TINYINT NOT NULL DEFAULT 5,
    loan_status ENUM('ACTIVE','PAID_OFF','CLOSED') NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_loan_user FOREIGN KEY (user_id) REFERENCES user_account(user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_loan_principal CHECK (principal_amount > 0),
    CONSTRAINT chk_loan_balance CHECK (outstanding_balance >= 0),
    CONSTRAINT chk_loan_rate CHECK (annual_interest_rate >= 0),
    CONSTRAINT chk_loan_tenure CHECK (tenure_months > 0),
    CONSTRAINT chk_loan_due_day CHECK (due_day BETWEEN 1 AND 28)
) ENGINE=InnoDB;

-- 3. Repayment Table
CREATE TABLE IF NOT EXISTS repayment (
    repayment_id INT AUTO_INCREMENT PRIMARY KEY,
    payment_id INT DEFAULT NULL,
    loan_id INT NOT NULL,
    payment_date DATE NOT NULL,
    amount DECIMAL(14,2) NOT NULL,
    principal_paid DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    interest_paid DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    payment_method ENUM('UPI','BANK_TRANSFER','AUTO_DEBIT','CASH','OTHER') NOT NULL DEFAULT 'BANK_TRANSFER',
    reference_code VARCHAR(80) DEFAULT NULL UNIQUE,
    notes VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_repayment_loan FOREIGN KEY (loan_id) REFERENCES loan(loan_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_repayment_amount CHECK (amount > 0),
    CONSTRAINT chk_repayment_principal CHECK (principal_paid >= 0),
    CONSTRAINT chk_repayment_interest CHECK (interest_paid >= 0)
) ENGINE=InnoDB;

-- 4. Prepayment Table
CREATE TABLE IF NOT EXISTS prepayment (
    prepayment_id INT AUTO_INCREMENT PRIMARY KEY,
    payment_id INT DEFAULT NULL,
    loan_id INT NOT NULL,
    prepayment_date DATE NOT NULL,
    amount DECIMAL(14,2) NOT NULL,
    strategy ENUM('AVALANCHE','SNOWBALL','MANUAL') NOT NULL DEFAULT 'MANUAL',
    notes VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_prepayment_loan FOREIGN KEY (loan_id) REFERENCES loan(loan_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_prepayment_amount CHECK (amount > 0)
) ENGINE=InnoDB;

-- 5. Audit Log Table
CREATE TABLE IF NOT EXISTS audit_log (
    audit_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    entity_name VARCHAR(60) NOT NULL DEFAULT 'LOAN',
    entity_id INT NOT NULL,
    action_name VARCHAR(30) NOT NULL,
    action_details VARCHAR(500) DEFAULT NULL,
    action_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- =====================================================================
-- Triggers
-- =====================================================================

DROP TRIGGER IF EXISTS trg_after_repayment_insert;
DELIMITER $$
CREATE TRIGGER trg_after_repayment_insert
AFTER INSERT ON repayment
FOR EACH ROW
BEGIN
    UPDATE loan
    SET outstanding_balance = GREATEST(0.00, outstanding_balance - NEW.principal_paid),
        loan_status = CASE WHEN outstanding_balance - NEW.principal_paid <= 0 THEN 'PAID_OFF' ELSE loan_status END
    WHERE loan_id = NEW.loan_id;

    INSERT INTO audit_log (entity_name, entity_id, action_name, action_details, action_time)
    VALUES (
        'LOAN',
        NEW.loan_id,
        'REPAYMENT_RECORDED',
        CONCAT('Repayment of ₹', NEW.amount, ' recorded (Principal: ₹', NEW.principal_paid, ', Interest: ₹', NEW.interest_paid, ')'),
        NOW()
    );
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_after_prepayment_insert;
DELIMITER $$
CREATE TRIGGER trg_after_prepayment_insert
AFTER INSERT ON prepayment
FOR EACH ROW
BEGIN
    UPDATE loan
    SET outstanding_balance = GREATEST(0.00, outstanding_balance - NEW.amount),
        loan_status = CASE WHEN outstanding_balance - NEW.amount <= 0 THEN 'PAID_OFF' ELSE loan_status END
    WHERE loan_id = NEW.loan_id;

    INSERT INTO audit_log (entity_name, entity_id, action_name, action_details, action_time)
    VALUES (
        'LOAN',
        NEW.loan_id,
        'PREPAYMENT_APPLIED',
        CONCAT('Prepayment of ₹', NEW.amount, ' applied via strategy [', NEW.strategy, ']'),
        NOW()
    );
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_after_loan_insert;
DELIMITER $$
CREATE TRIGGER trg_after_loan_insert
AFTER INSERT ON loan
FOR EACH ROW
BEGIN
    INSERT INTO audit_log (entity_name, entity_id, action_name, action_details, action_time)
    VALUES (
        'LOAN',
        NEW.loan_id,
        'LOAN_CREATED',
        CONCAT('Created loan "', NEW.loan_name, '" (Principal: ₹', NEW.principal_amount, ', Rate: ', NEW.annual_interest_rate, '%)'),
        NOW()
    );
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_after_loan_delete;
DELIMITER $$
CREATE TRIGGER trg_after_loan_delete
AFTER DELETE ON loan
FOR EACH ROW
BEGIN
    INSERT INTO audit_log (entity_name, entity_id, action_name, action_details, action_time)
    VALUES (
        'LOAN',
        OLD.loan_id,
        'LOAN_DELETED',
        CONCAT('Deleted loan "', OLD.loan_name, '" (Previous Balance: ₹', OLD.outstanding_balance, ')'),
        NOW()
    );
END$$
DELIMITER ;

-- =====================================================================
-- Seed Data
-- =====================================================================

INSERT INTO user_account (user_id, full_name, email, monthly_income) VALUES
(1, 'Aarav Sharma', 'aarav.sharma@example.com', 125000.00),
(2, 'Diya Patel', 'diya.patel@example.com', 95000.00),
(3, 'Kabir Mehta', 'kabir.mehta@example.com', 160000.00)
ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), monthly_income=VALUES(monthly_income);

-- Loans for Aarav (User 1)
INSERT INTO loan (loan_id, user_id, loan_name, lender_name, loan_type, principal_amount, outstanding_balance, annual_interest_rate, annual_rate_type, tenure_months, start_date, due_day, loan_status)
VALUES
(101, 1, 'Dream Home Loan', 'HDFC Bank', 'HOME', 4500000.00, 4120000.00, 8.50, 'REDUCING', 240, '2023-01-15', 5, 'ACTIVE'),
(102, 1, 'Creta SUV Auto Loan', 'ICICI Bank', 'AUTO', 900000.00, 620000.00, 9.25, 'REDUCING', 60, '2023-06-10', 10, 'ACTIVE'),
(103, 1, 'Executive Personal Loan', 'State Bank of India', 'PERSONAL', 350000.00, 210000.00, 12.75, 'REDUCING', 36, '2024-02-01', 7, 'ACTIVE'),
(104, 1, 'Credit Line Overdraft', 'Axis Bank', 'PERSONAL', 150000.00, 85000.00, 15.00, 'REDUCING', 24, '2024-05-12', 2, 'ACTIVE')
ON DUPLICATE KEY UPDATE loan_name=VALUES(loan_name);

-- Loans for Diya (User 2)
INSERT INTO loan (loan_id, user_id, loan_name, lender_name, loan_type, principal_amount, outstanding_balance, annual_interest_rate, annual_rate_type, tenure_months, start_date, due_day, loan_status)
VALUES
(201, 2, 'Higher Education Loan', 'Canara Bank', 'EDUCATION', 1800000.00, 1420000.00, 8.85, 'REDUCING', 84, '2022-09-01', 5, 'ACTIVE'),
(202, 2, 'Relocation Personal Loan', 'Kotak Mahindra', 'PERSONAL', 250000.00, 135000.00, 13.50, 'REDUCING', 36, '2023-11-15', 10, 'ACTIVE')
ON DUPLICATE KEY UPDATE loan_name=VALUES(loan_name);

-- Loans for Kabir (User 3)
INSERT INTO loan (loan_id, user_id, loan_name, lender_name, loan_type, principal_amount, outstanding_balance, annual_interest_rate, annual_rate_type, tenure_months, start_date, due_day, loan_status)
VALUES
(301, 3, 'Commercial Office Loan', 'State Bank of India', 'HOME', 6500000.00, 5800000.00, 8.75, 'REDUCING', 180, '2022-04-10', 5, 'ACTIVE'),
(302, 3, 'EV Sedan Auto Loan', 'Tata Capital', 'AUTO', 1200000.00, 780000.00, 9.60, 'REDUCING', 48, '2023-08-01', 12, 'ACTIVE'),
(303, 3, 'Gadget Flexi Loan', 'Bajaj Finserv', 'PERSONAL', 120000.00, 48000.00, 16.50, 'REDUCING', 18, '2024-03-20', 15, 'ACTIVE')
ON DUPLICATE KEY UPDATE loan_name=VALUES(loan_name);

-- Sample initial audit records
INSERT INTO audit_log (loan_id, action_type, action_details, performed_at)
VALUES
(101, 'SYSTEM_INIT', 'Initial portfolio migrated for Aarav Sharma', NOW() - INTERVAL 10 DAY),
(102, 'SYSTEM_INIT', 'Vehicle loan setup verified', NOW() - INTERVAL 8 DAY),
(103, 'REPAYMENT_RECORDED', 'Monthly EMI paid of ₹11,760 for SBI Personal Loan', NOW() - INTERVAL 5 DAY),
(104, 'PREPAYMENT_APPLIED', 'Lump sum prepayment of ₹25,000 allocated to Axis Overdraft', NOW() - INTERVAL 2 DAY);
