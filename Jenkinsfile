pipeline {
    agent any

    tools {
        maven 'Maven-3.9.6'
        jdk 'JDK-17'
    }

    stages {
        stage('Checkout Code') {
            steps {
                echo 'Checking out source repository...'
                checkout scm
            }
        }

        stage('Verify Java Core & Tests') {
            steps {
                echo 'Building Java Engine and running 9 unit tests...'
                sh 'mvn clean test'
            }
        }

        stage('Verify Web Full Stack Platform') {
            steps {
                echo 'Installing Web Node dependencies and running calculation test suite...'
                dir('web') {
                    sh 'npm install'
                    sh 'npm test'
                }
            }
        }

        stage('Package Artifacts') {
            steps {
                echo 'Packaging LoanWise shaded JAR...'
                sh 'mvn clean package -DskipTests'
            }
        }
    }

    post {
        success {
            echo 'LoanWise CI Pipeline passed all verification stages successfully!'
        }
        failure {
            echo 'LoanWise CI Pipeline build failed. Please inspect logs.'
        }
    }
}
