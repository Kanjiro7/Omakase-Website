import {
    testSystemConnectivity,
    testTourAvailabilityGeneration,
    testManualRegeneration,
    getSystemPerformanceMetrics,
    runDateRegeneration,
    runFullSystemTest,
    testStatusFieldIdentification,
    runComprehensiveToursStatusCheck,
    analyzeSelectedTourAvailability
} from 'backend/availability/availabilityTester.web.js';

import wixData from 'wix-data';
import wixWindow from 'wix-window';

/**
 * Testing page controller for Omakase Tour availability system
 * Provides comprehensive testing interface with logging
 */

// Initialize page when it loads
$w.onReady(function () {
    console.log("Page onReady started");
    
    // Initialize page state and UI components
    initializePage();
    populateTourDropdown();
    
    // Manual event binding to ensure buttons work properly
    $w('#runTestsButton').onClick(runTestsButton_click);
    $w('#generateAvailabilityButton').onClick(generateAvailabilityButton_click); 
    $w('#clearLogButton').onClick(clearLogButton_click);
    
    // Date regeneration button with existence check
    try {
        const dateRegenerationButton = $w('#runDateRegenerationButton');
        dateRegenerationButton.onClick(runDateRegenerationButton_click);
        console.log("Date regeneration button bound successfully");
    } catch (elementError) {
        console.log("Date regeneration button not found, skipping binding");
        appendLog("⚠️ Date regeneration button not found in page");
    }
    
    // Tours Status Check button
    try {
        const toursStatusCheckButton = $w('#runToursStatusCheckButton');
        toursStatusCheckButton.onClick(runToursStatusCheckButton_click);
        console.log("Tours Status Check button bound successfully");
    } catch (elementError) {
        console.log("Tours Status Check button not found, skipping binding");
    }
    
    // Individual tour analysis button
    try {
        const tourAnalysisButton = $w('#analyzeSelectedTourButton');
        tourAnalysisButton.onClick(analyzeSelectedTourButton_click);
        console.log("Tour analysis button bound successfully");
    } catch (elementError) {
        console.log("Tour analysis button not found, skipping binding");
    }
    
    console.log("All button events bound successfully");
});

/**
 * Set up initial page state and welcome message
 */
function initializePage() {
    console.log("Initializing page...");
    setLog("Test system loaded. Ready to run availability system tests.");
    setStatus("Ready");
    appendLog("Test page initialized successfully.");
    console.log("Page initialization completed");
}

/**
 * Populate tour dropdown with visible tours from database
 * Only loads tours that are currently published/visible
 */
async function populateTourDropdown() {
    try {
        console.log("Starting tour dropdown population...");
        appendLog("📋 Loading tours for dropdown...");
        
        // Load visible tours for testing
        const toursQuery = await wixData.query("Tours")
            .eq("_publishStatus", "PUBLISHED")
            .find();
        
        console.log(`Found ${toursQuery.totalCount} visible tours`);
        
        if (toursQuery.items.length === 0) {
            $w("#tourSelector").options = [{ label: "No visible tours found", value: "" }];
            appendLog("⚠️ No visible tours found");
            return;
        }
        
        // Create dropdown options with custom properties using JavaScript objects
        const options = [
            { label: "-- Select a tour --", value: "" },
            ...toursQuery.items.map(tour => {
                // Create option object with custom tourId property
                const option = {
                    label: tour.title || tour.urlName || "Unnamed Tour",
                    value: tour.urlName
                };
                // Add custom property using bracket notation to avoid TypeScript errors
                option['tourId'] = tour._id;
                return option;
            })
        ];
        
        $w("#tourSelector").options = options;
        
        appendLog(`✅ Loaded ${toursQuery.items.length} tours in dropdown`);
        console.log("Tour dropdown populated successfully");
        
    } catch (error) {
        console.error("Error populating tour dropdown:", error);
        appendLog(`❌ Error loading tours: ${error.message}`);
        $w("#tourSelector").options = [{ label: "Error loading tours", value: "" }];
    }
}

/**
 * Helper function to format closed periods for logging with consistent logic
 * Ensures closed periods are displayed on a single line
 * @param {Array} closedPeriods - Array of closed period objects
 * @returns {string} Formatted closed periods information
 */
function formatClosedPeriodsForDisplay(closedPeriods) {
    if (!closedPeriods || !Array.isArray(closedPeriods) || closedPeriods.length === 0) {
        return "None configured";
    }
    
    const details = closedPeriods.map(period => {
        const startDate = `${String(period.startMonth).padStart(2, '0')}-${String(period.startDay).padStart(2, '0')}`;
        const endDate = `${String(period.endMonth).padStart(2, '0')}-${String(period.endDay).padStart(2, '0')}`;
        
        if (period.startMonth === period.endMonth && period.startDay === period.endDay) {
            return `${startDate} (${period.reason})`;
        } else {
            return `${startDate} to ${endDate} (${period.reason})`;
        }
    });
    
    return `${closedPeriods.length} periods: ${details.join(', ')}`;
}

/**
 * Get closed periods from availability record for consistent reporting
 * @param {string} tourId - Database ID of the tour
 * @returns {Promise<Array>} Closed periods array
 */
async function getClosedPeriodsFromAvailability(tourId) {
    try {
        if (!tourId) return [];
        
        const availabilityQuery = await wixData.query("Availability")
            .eq("tourName", tourId)
            .find();
        
        if (availabilityQuery.items.length > 0) {
            return availabilityQuery.items[0].closedPeriods || [];
        }
        
        return [];
    } catch (error) {
        console.error("Error getting closed periods from availability:", error);
        return [];
    }
}

// Utility functions for log management

/**
 * Completely replace log content with new message
 */
function setLog(message) {
    $w("#logOutput").text = message;
}

/**
 * Append new log message with timestamp
 */
function appendLog(message, statusText) {
    const timestamp = new Date().toLocaleString('en-GB', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    
    const currentLog = $w("#logOutput").text;
    const newLog = `[${timestamp}] ${message}\n${currentLog}`;
    
    // Keep only last 150 lines to prevent UI overflow
    const lines = newLog.split('\n');
    $w("#logOutput").text = lines.slice(0, 150).join('\n');
    
    if (statusText) setStatus(statusText);
}

/**
 * Append multi-line log content without timestamp for intermediate lines
 * Used for detailed test results and analysis output
 */
function appendMultilineLog(content) {
    const currentLog = $w("#logOutput").text;
    const newLog = `${content}\n${currentLog}`;
    
    // Keep only last 150 lines to prevent UI overflow
    const lines = newLog.split('\n');
    $w("#logOutput").text = lines.slice(0, 150).join('\n');
}

/**
 * Append log with start and end timestamps, multiline content without timestamps
 * Used for comprehensive test results with proper formatting
 */
function appendLogWithStartEnd(startMessage, multilineContent, endMessage) {
    const timestamp = new Date().toLocaleString('en-GB', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    
    // Add start message with timestamp
    const currentLog = $w("#logOutput").text;
    
    // Construct the complete log entry (no line breaks for closed periods)
    const logEntry = `[${timestamp}] ${endMessage}\n${multilineContent}\n[${timestamp}] ${startMessage}\n${currentLog}`;
    
    // Keep only last 150 lines to prevent UI overflow
    const lines = logEntry.split('\n');
    $w("#logOutput").text = lines.slice(0, 150).join('\n');
}

/**
 * Update system status indicator
 */
function setStatus(statusText) {
    $w("#systemStatus").text = statusText;
}

/**
 * Show confirmation dialog for critical operations
 */
async function showConfirmation(message) {
    try {
        console.log("Opening confirmation dialog with message:", message);
        const result = await wixWindow.openLightbox("confirmLightbox2", { message });
        console.log("Confirmation dialog result:", result);
        return result === "confirm";
    } catch (error) {
        console.error("Error in confirmation dialog:", error);
        appendLog(`❌ Error in confirmation dialog: ${error.message}`);
        return false;
    }
}

// BUTTON HANDLERS

/**
 * Handler for comprehensive system tests
 * Runs complete system health check including database connectivity and consistency
 */
export function runTestsButton_click() {
    console.log("🚀 runTestsButton_click called - starting comprehensive system tests");
    setStatus("Running tests...");
    appendLog("🚀 Starting comprehensive system health tests...", "Running tests...");
    runComprehensiveSystemTests();
}

/**
 * Handler for comprehensive tours status check
 * Analyzes tour visibility, availability status, and configuration for all tours
 */
export async function runToursStatusCheckButton_click() {
    console.log("🔍 runToursStatusCheckButton_click called - starting comprehensive tours status check");
    setStatus("Checking tours status...");
    appendLog("🔍 Starting comprehensive tours status analysis...", "Checking tours status...");
    
    try {
        const statusResult = await runComprehensiveToursStatusCheck();
        logComprehensiveToursStatusResults(statusResult);
        
        appendLog("✅ Comprehensive tours status check completed!", "Tours status check completed");
        setStatus("Tours status check completed");
        
    } catch (error) {
        console.error("Tours status check failed:", error);
        appendLog(`❌ Tours status check failed: ${error.message}`, "Tours status check failed");
        setStatus("Tours status check failed");
    }
}

/**
 * Handler for selected tour detailed analysis
 * Provides comprehensive analysis of tour configuration and availability
 */
export async function analyzeSelectedTourButton_click() {
    console.log("📊 analyzeSelectedTourButton_click called");
    
    const selectedValue = $w("#tourSelector").value;
    console.log("Selected tour value:", selectedValue);
    
    if (!selectedValue || selectedValue === "") {
        console.log("No tour selected");
        appendLog("❌ Please select a tour from the dropdown to analyze.", "No tour selected");
        return;
    }
    
    // Extract tour information from dropdown selection properly
    const selectedOption = $w("#tourSelector").options.find(opt => opt.value === selectedValue);
    const tourLabel = selectedOption ? selectedOption.label : selectedValue;
    
    // Get tour ID from custom property using bracket notation
    let tourId = null;
    if (selectedOption && selectedOption['tourId']) {
        tourId = selectedOption['tourId'];
        console.log("Found tour ID:", tourId);
    } else {
        console.log("Tour ID not found in option, attempting to fetch from database");
        // Fallback: query database for tour ID
        try {
            const tourQuery = await wixData.query("Tours")
                .eq("urlName", selectedValue)
                .find();
            
            if (tourQuery.items.length > 0) {
                tourId = tourQuery.items[0]._id;
                console.log("Fetched tour ID from database:", tourId);
            }
        } catch (error) {
            console.error("Error fetching tour ID:", error);
        }
    }
    
    if (!tourId) {
        appendLog("❌ Could not determine tour ID for selected tour.", "Analysis failed");
        return;
    }
    
    setStatus("Analyzing tour...");
    appendLog(`📊 Analyzing availability configuration for: ${tourLabel}...`, "Analyzing tour...");
    
    try {
        const analysisResult = await analyzeSelectedTourAvailability(tourId);
        logTourAnalysisResults(analysisResult, tourLabel);
        
        appendLog("✅ Tour analysis completed!", "Analysis completed");
        setStatus("Analysis completed");
        
    } catch (error) {
        console.error("Tour analysis failed:", error);
        appendLog(`❌ Tour analysis failed: ${error.message}`, "Analysis failed");
        setStatus("Analysis failed");
    }
}

/**
 * Handler for monthly date regeneration
 * CORRECTED: Now passes isManual=true to distinguish from automatic execution
 * Executes monthly update cycle for all visible tours
 */
export async function runDateRegenerationButton_click() {
    console.log("⚠️ runDateRegenerationButton_click called - showing confirmation");
    
    // More specific message with actual month information
    const currentDate = new Date();
    const prevMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    const futureMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 17, 1);
    
    const prevMonthStr = `${prevMonth.getFullYear()}.${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
    const futureMonthStr = `${futureMonth.getFullYear()}.${String(futureMonth.getMonth() + 1).padStart(2, '0')}`;
    
    const confirmed = await showConfirmation(
        `This operation will start the monthly date update cycle for all published tours.\nThe process will handle the 18 months of availability\n\nThe previous month will be removed:\n${prevMonthStr}\n\nA new month wll be added:\n${futureMonthStr}\n\nThis will not delete or modify existing bookings.\nContinue?`
    );
    
    console.log("User confirmation result:", confirmed);
    
    if (confirmed) {
        console.log("User confirmed - starting date regeneration");
        setStatus("Running date regeneration...");
        appendLog("🔄 Running monthly date regeneration for all tours...", "Running date regeneration...");
        runDateRegenerationSequence();
    } else {
        console.log("User cancelled operation");
        appendLog("ℹ️ Operation cancelled by user", "Operation cancelled");
        setStatus("Operation cancelled");
    }
}

/**
 * Handler for individual tour availability generation
 * Creates or regenerates availability for selected tour
 */
export async function generateAvailabilityButton_click() {
    console.log("🎯 generateAvailabilityButton_click called");
    
    const selectedValue = $w("#tourSelector").value;
    console.log("Selected tour value:", selectedValue);
    
    if (!selectedValue || selectedValue === "") {
        console.log("No tour selected");
        appendLog("❌ Please select a tour from the dropdown.", "No tour selected");
        return;
    }
    
    const selectedOption = $w("#tourSelector").options.find(opt => opt.value === selectedValue);
    const tourLabel = selectedOption ? selectedOption.label : selectedValue;
    
    // Safe access to custom tourId property using bracket notation
    let tourId = null;
    if (selectedOption && selectedOption['tourId']) {
        tourId = selectedOption['tourId'];
    }
    
    console.log("Selected tour label:", tourLabel);
    console.log("Selected tour ID:", tourId);
    
    const existingAvailability = await checkExistingAvailability(tourId);
    
    if (existingAvailability) {
        const confirmed = await showConfirmation(
            `This operation will regenerate availability dates for tour:\n\n"${tourLabel}".\n\nThe database will be rebuilt while preserving all soldout/available statuses and existing bookings.\n\nContinue?`
        );
        
        if (!confirmed) {
            appendLog("ℹ️ Regeneration cancelled by user", "Operation cancelled");
            setStatus("Operation cancelled");
            return;
        }
        
        console.log("User confirmed regeneration for:", selectedValue);
        setStatus("Regenerating availability...");
        appendLog(`⏳ Regenerating availability for: ${tourLabel}...`, "Regenerating availability...");
        regenerateAvailabilityForSelectedTour(selectedValue, tourId);
    } else {
        const confirmed = await showConfirmation(
            `This operation will generate availability dates for tour:\n\n"${tourLabel}".\n\nIf availabilities are already present, the database will be rebuilt.\nSoldout/available statuses and existing bookings will be preserved.\n\nContinue?`
        );
        
        if (confirmed) {
            console.log("User confirmed single tour generation for:", selectedValue);
            setStatus("Generating availability...");
            appendLog(`⏳ Generating availability for: ${tourLabel}...`, "Generating availability...");
            generateAvailabilityForSelectedTour(selectedValue);
        } else {
            console.log("User cancelled single tour generation");
            appendLog("ℹ️ Generation cancelled by user", "Generation cancelled");
            setStatus("Generation cancelled");
        }
    }
}

/**
 * Handler for clearing log and resetting status
 */
export function clearLogButton_click() {
    console.log("🧹 clearLogButton_click called - clearing log");
    setLog("📋 Log cleared. System ready for new tests.");
    setStatus("Ready");
    console.log("[TEST PAGE] Log cleared by user");
}

// TEST EXECUTION SEQUENCES

/**
 * Execute comprehensive system health tests
 * Runs all core system validation tests with detailed reporting
 */
async function runComprehensiveSystemTests() {
    console.log("Starting comprehensive system health tests...");
    
    try {
        // Test 1: Database connectivity health check
        console.log("Running Test 1: Database Connectivity");
        appendLog("📡 Test 1: Database Connectivity Health Check");
        const connectivityResult = await testSystemConnectivity();
        logConnectivityResults(connectivityResult);

        // Test 2: Status field identification
        console.log("Running Test 2: Status Field Identification");
        appendLog("📋 Test 2: Tour Status Field Analysis");
        const statusFieldResult = await testStatusFieldIdentification();
        logStatusFieldResults(statusFieldResult);

        // Test 3: Comprehensive Tours Status Check
        console.log("Running Test 3: Comprehensive Tours Status Check");
        appendLog("🔍 Test 3: Comprehensive Tours Status Analysis");
        const toursStatusResult = await runComprehensiveToursStatusCheck();
        logComprehensiveToursStatusResults(toursStatusResult);

        // Test 4: Sample tour availability test with actual data
        console.log("Running Test 4: Sample Tour Availability Test");
        appendLog("⚗️ Test 4: Sample Tour Availability Generation Test");
        const sampleTour = await getSampleTourForTesting();
        if (sampleTour) {
            const generationResult = await testTourAvailabilityGeneration(sampleTour.urlName, false);
            logGenerationResults(generationResult);
        } else {
            appendLog("⚠️ No sample tour available for availability generation test");
        }

        // Test 5: System performance and health metrics
        console.log("Running Test 5: System Performance Metrics");
        appendLog("📊 Test 5: System Performance and Health Metrics");
        const metricsResult = await getSystemPerformanceMetrics();
        logMetricsResults(metricsResult);

        console.log("All comprehensive system tests completed successfully");
        appendLog("✅ All comprehensive system tests completed successfully!", "Tests completed");

    } catch (error) {
        console.error("Comprehensive test sequence failed:", error);
        appendLog(`❌ Comprehensive test sequence failed: ${error.message}`, "Tests failed");
    }
}

/**
 * Execute monthly date regeneration sequence
 * CORRECTED: Now passes isManual=true to indicate manual execution from testing page
 * Handles the monthly update process for all tours
 */
async function runDateRegenerationSequence() {
    console.log("Starting date regeneration sequence...");
    
    try {
        appendLog("🔄 Running monthly date regeneration for all tours...");
        
        // CORREZIONE: Passa isManual=true per indicare esecuzione manuale dalla testing page
        const result = await runDateRegeneration(true);
        
        console.log("Date regeneration result:", result);
        
        if (result.success) {
            appendLog(`✅ Date regeneration completed successfully! ${result.toursUpdated || 0} tours updated.`, "Regeneration completed");
            setStatus("Regeneration completed");
            
            if (result.toursFailed && result.toursFailed > 0) {
                appendLog(`⚠️ Note: ${result.toursFailed} tours failed to update. Check logs for details.`);
            }
        } else {
            appendLog(`❌ Date regeneration failed: ${result.error || 'Unknown error'}`, "Regeneration failed");
            setStatus("Regeneration failed");
        }
        
    } catch (error) {
        console.error("Date regeneration sequence failed:", error);
        appendLog(`❌ Error during date regeneration: ${error.message}`, "Regeneration failed");
        setStatus("Regeneration failed");
    }
}

// HELPER FUNCTIONS

/**
 * Check if availability exists for a tour
 */
async function checkExistingAvailability(tourId) {
    try {
        if (!tourId) {
            return false;
        }
        
        const availabilityQuery = await wixData.query("Availability")
            .eq("tourName", tourId)
            .find();
        
        return availabilityQuery.items.length > 0;
        
    } catch (error) {
        console.error("Error checking existing availability:", error);
        return false;
    }
}

/**
 * Generate availability for a specific selected tour
 */
async function generateAvailabilityForSelectedTour(tourUrlName) {
    console.log("Generating availability for selected tour:", tourUrlName);
    
    try {
        console.log("Starting availability generation for:", tourUrlName);
        const result = await testTourAvailabilityGeneration(tourUrlName, false);
        console.log("Generation result for:", tourUrlName, result);
        
        if (result.status === "SUCCESS") {
            console.log("Successfully generated availability for:", tourUrlName);
            appendLog(`✅ Availability successfully generated for ${tourUrlName}`, "Generation completed");
            
            // Safe property access with fallback
            const datesCount = result.actualResults ? result.actualResults.generatedDatesCount : "unknown";
            appendLog(`📅 Generated ${datesCount} availability dates`);
            setStatus("Generation completed");
        } else if (result.status === "FAILED") {
            console.log("Failed to generate availability for:", tourUrlName);
            appendLog(`❌ Failed to generate availability for ${tourUrlName}`, "Generation failed");
            appendLog(`Error details: ${result.error || 'Unknown error'}`);
            setStatus("Generation failed");
        } else {
            console.log("Unexpected result for:", tourUrlName, result.status);
            appendLog(`⚠️ Unexpected result: ${result.status}`, "Unexpected result");
            setStatus("Unexpected result");
        }
        
        logGenerationResults(result);
        
    } catch (error) {
        console.error("Error generating availability for:", tourUrlName, error);
        appendLog(`❌ Error generating availability for ${tourUrlName}: ${error.message}`, "Generation failed");
        setStatus("Generation failed");
    }
}

/**
 * Regenerate availability for a specific tour
 */
async function regenerateAvailabilityForSelectedTour(tourUrlName, tourId) {
    console.log("Regenerating availability for tour:", tourUrlName);
    
    try {
        const result = await testManualRegeneration(tourUrlName, false);
        console.log("Regeneration result for:", tourUrlName, result);
        
        if (result.status === "SUCCESS") {
            console.log("Successfully regenerated availability for:", tourUrlName);
            appendLog(`✅ Availability successfully regenerated for ${tourUrlName}`, "Regeneration completed");
            
            // Safe property access with fallback
            const datesCount = result.regenerationResults ? result.regenerationResults.regeneratedDatesCount : "unknown";
            appendLog(`📅 Regenerated ${datesCount} availability dates`);
            setStatus("Regeneration completed");
        } else if (result.status === "FAILED") {
            console.log("Failed to regenerate availability for:", tourUrlName);
            appendLog(`❌ Failed to regenerate availability for ${tourUrlName}`, "Regeneration failed");
            appendLog(`Error details: ${result.error || 'Unknown error'}`);
            setStatus("Regeneration failed");
        } else {
            console.log("Unexpected result for:", tourUrlName, result.status);
            appendLog(`⚠️ Unexpected result: ${result.status}`, "Unexpected result");
            setStatus("Unexpected result");
        }
        
    } catch (error) {
        console.error("Error regenerating availability for:", tourUrlName, error);
        appendLog(`❌ Error regenerating availability for ${tourUrlName}: ${error.message}`, "Regeneration failed");
        setStatus("Regeneration failed");
    }
}

// LOGGING FUNCTIONS FOR TEST RESULTS

/**
 * Log database connectivity test results
 */
function logConnectivityResults(result) {
    const statusIcon = result.overallStatus === 'SUCCESS' ? '✅' : '❌';
    
    const multilineContent = `• Tours: ${result.tests.toursDatabase.status} (${result.tests.toursDatabase.recordCount} records)
• Availability: ${result.tests.availabilityDatabase.status} (${result.tests.availabilityDatabase.recordCount} records)
• SystemState: ${result.tests.systemStateDatabase.status} (${result.tests.systemStateDatabase.recordCount} records)
• HighSeasonPeriods: ${result.tests.highSeasonDatabase.status} (${result.tests.highSeasonDatabase.recordCount} records)`;

    appendLogWithStartEnd(
        `${statusIcon} Database Connectivity: ${result.overallStatus}`,
        multilineContent,
        `${statusIcon} Database Connectivity Test Completed`
    );
}

/**
 * Log status field test results
 */
function logStatusFieldResults(result) {
    const statusIcon = result.statusRelatedFields && result.statusRelatedFields.length > 0 ? '✅' : '⚠️';
    
    const multilineContent = `• Fields found: ${result.statusRelatedFields ? result.statusRelatedFields.join(', ') : 'None'}
• Sample tour: ${result.sampleTourTitle || 'None'}
• Total fields: ${result.totalFields || 0}`;

    appendLogWithStartEnd(
        `${statusIcon} Status Field Test: Complete`,
        multilineContent,
        `${statusIcon} Status Field Analysis Completed`
    );
}

/**
 * Log comprehensive tours status results
 */
function logComprehensiveToursStatusResults(result) {
    const healthIcon = result.systemHealth === 'HEALTHY' ? '✅' : 
                       result.systemHealth === 'WARNING' ? '⚠️' : '❌';
    
    let multilineContent = `• Total Tours: ${result.overallStats.totalTours}
• Visible Tours: ${result.overallStats.visibleTours}
• Hidden Tours: ${result.overallStats.hiddenTours}
• Tours with Availability: ${result.overallStats.toursWithAvailability}
• Consistency Issues: ${result.overallStats.consistencyIssues}`;
    
    if (result.consistencyIssues && result.consistencyIssues.length > 0) {
        multilineContent += '\n⚠️ Issues found:';
        result.consistencyIssues.forEach(issue => {
            multilineContent += `\n  - ${issue}`;
        });
    }
    
    if (result.recommendations && result.recommendations.length > 0) {
        multilineContent += '\n💡 Recommendations:';
        result.recommendations.forEach(rec => {
            multilineContent += `\n  - ${rec}`;
        });
    }

    appendLogWithStartEnd(
        `${healthIcon} Tours Status Analysis: ${result.systemHealth}`,
        multilineContent,
        `${healthIcon} Comprehensive Tours Analysis Completed`
    );
}

/**
 * Log tour analysis results
 */
function logTourAnalysisResults(result, tourLabel) {
    const statusIcon = result.status === 'SUCCESS' ? '✅' : '❌';
    
    if (result.status === 'SUCCESS' && result.tourDetails) {
        let multilineContent = `• Tour ID: ${result.tourDetails.tourId || 'Not set'}
• Database ID: ${result.tourDetails.databaseId}
• Visibility: ${result.tourDetails.visibility}
• Operating Days: ${result.operatingDays ? result.operatingDays.join(', ') : 'None'}
• High Season Policy: ${result.highSeasonPolicy ? result.highSeasonPolicy.name : 'None'}
• Cancellation Policy: ${result.cancellationPolicy}
• Closed Periods: ${result.closedPeriods}`;
        
        if (result.availabilityStatus && result.availabilityStatus.hasAvailability) {
            const stats = result.availabilityStatus.stats;
            multilineContent += `\n• Availability Stats:
  - Total Dates: ${stats.totalDates}
  - Available Dates: ${stats.availableDates}
  - High Season Dates: ${stats.highSeasonDates}
  - Normal Season Dates: ${stats.normalSeasonDates}`;
            if (stats.dateRange) {
                multilineContent += `\n  - Date Range: ${stats.dateRange.from} to ${stats.dateRange.to}`;
            }
        } else {
            multilineContent += '\n• Availability: ❌ No availability data found';
        }

        appendLogWithStartEnd(
            `${statusIcon} Tour Analysis: ${tourLabel}`,
            multilineContent,
            `${statusIcon} Tour Analysis Completed`
        );
    } else {
        appendLog(`${statusIcon} Tour Analysis Failed: ${result.error}`);
    }
}

/**
 * Log availability generation test results with mode description
 */
async function logGenerationResults(result) {
    const statusIcon = (result.status === 'DRY_RUN_SUCCESS' || result.status === 'SUCCESS') ? '✅' : '❌';
    
    let multilineContent = `• Status: ${result.status}
• Tour: ${result.tourUrlName}
• Mode: ${result.dryRun ? 'DRY-RUN (Safe Simulation)' : 'Manual Execution'}`;
    
    if (result.tourData) {
        multilineContent += `\n• Tour ID: ${result.tourData.tourId || 'Not set'}
• Database ID: ${result.tourData.databaseId}
• Operating Days: ${result.tourData.runDays ? result.tourData.runDays.join(', ') : 'NA'}`;

        // Get closed periods from availability record for accurate reporting
        let hasClosedPeriods = false;
        let closedPeriodsDisplay = "None configured";
        
        if (result.tourData.databaseId) {
            try {
                const closedPeriods = await getClosedPeriodsFromAvailability(result.tourData.databaseId);
                if (closedPeriods && closedPeriods.length > 0) {
                    hasClosedPeriods = true;
                    closedPeriodsDisplay = formatClosedPeriodsForDisplay(closedPeriods);
                }
            } catch (error) {
                console.error("Error getting closed periods for generation result:", error);
            }
        }
        
        multilineContent += `\n• Has Closed Periods: ${hasClosedPeriods ? 'Yes' : 'No'}`;
        if (hasClosedPeriods) {
            multilineContent += `\n• Closed Periods: ${closedPeriodsDisplay}`;
        }
        
        multilineContent += `\n• High Season Policy: ${result.tourData.highSeasonPolicy}
• Cancellation Policy: ${result.tourData.cancellationPolicy}`;
    }
    
    if (result.simulatedResults) {
        multilineContent += `\n• Estimated dates: ${result.simulatedResults.estimatedDatesCount}`;
    }
    
    if (result.actualResults) {
        multilineContent += `\n• Generated dates: ${result.actualResults.generatedDatesCount || result.actualResults.regeneratedDatesCount || 'Unknown'}`;
    }

    appendLogWithStartEnd(
        `${statusIcon} Availability Generation Test`,
        multilineContent,
        `${statusIcon} Generation Test Completed`
    );
}

/**
 * Log system performance metrics
 */
function logMetricsResults(metrics) {
    const healthIcon = metrics.systemHealth === 'HEALTHY' ? '✅' : 
                       metrics.systemHealth === 'WARNING' ? '⚠️' : '❌';
    
    let multilineContent = `• System Health: ${metrics.systemHealth}
• Total Logs: ${metrics.totalLogs}
• Error Count: ${metrics.errorCount}
• Successful Operations: ${metrics.successfulOperations}`;
    
    if (metrics.recentActivity) {
        multilineContent += `\n• Last 24h Activity: ${metrics.recentActivity.last24Hours || 0}
• Recent Errors (24h): ${metrics.recentActivity.recentErrors || 0}`;
    }

    appendLogWithStartEnd(
        `${healthIcon} System Performance Metrics`,
        multilineContent,
        `${healthIcon} Performance Analysis Completed`
    );
}

/**
 * Get a sample tour for testing purposes
 */
async function getSampleTourForTesting() {
    try {
        const tours = await wixData.query("Tours")
            .eq("_publishStatus", "PUBLISHED")
            .limit(1)
            .find();

        return tours.items.length > 0 ? tours.items[0] : null;
    } catch (error) {
        console.error('Error getting sample tour:', error);
        return null;
    }
}
