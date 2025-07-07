import { webMethod, Permissions } from "wix-web-module";
import wixData from 'wix-data';
import { createInitialAvailability, generateAvailabilityForTour, fetchCancellationPolicy } from 'backend/availability/availabilityCore.web.js';
import { logSystemState, getSystemStatistics, performSystemHealthCheck } from 'backend/shared/systemStateManager.web.js';
import { executeMonthlyAvailabilityUpdate, testMonthlyUpdate } from './availabilityScheduler.web.js';

/**
 * Comprehensive testing suite for availability system
 * Provides diagnostic and testing capabilities for tour availability management
 * Includes tour visibility analysis, system consistency checks, and performance monitoring
 */

/**
 * Test system connectivity and database access
 * Verifies that all required databases are accessible and responsive
 * @returns {Promise<Object>} Test results with database status information
 */
export const testSystemConnectivity = webMethod(
    Permissions.Anyone,
    async () => {
        const results = {
            timestamp: new Date(),
            tests: {},
            overallStatus: 'UNKNOWN'
        };

        try {
            // Test database access for all collections
            results.tests.toursDatabase = await testDatabaseAccess('Tours');
            results.tests.availabilityDatabase = await testDatabaseAccess('Availability');
            results.tests.systemStateDatabase = await testDatabaseAccess('SystemState');
            results.tests.highSeasonDatabase = await testDatabaseAccess('HighSeasonPeriods');
            results.tests.cancellationPolicyDatabase = await testDatabaseAccess('CancellationPolicies');

            // Determine overall status based on failed tests
            const failedTests = Object.values(results.tests).filter(test => test.status === 'FAILED');
            results.overallStatus = failedTests.length === 0 ? 'SUCCESS' : 'PARTIAL_FAILURE';

            // Log test results to system state
            await logSystemState({
                stateType: "System Test",
                operationType: "SYSTEM_TEST",
                executionStatus: results.overallStatus === 'SUCCESS' ? "Completed Successfully" : "Completed with errors",
                logData: `Connectivity test: ${results.overallStatus}. Tours: ${results.tests.toursDatabase.status}, Availability: ${results.tests.availabilityDatabase.status}, SystemState: ${results.tests.systemStateDatabase.status}, HighSeasonPeriods: ${results.tests.highSeasonDatabase.status}, CancellationPolicies: ${results.tests.cancellationPolicyDatabase.status}`
            });

            return results;

        } catch (error) {
            results.overallStatus = 'FAILED';
            results.error = error.message;
            
            await logSystemState({
                stateType: "System Test",
                operationType: "SYSTEM_TEST",
                executionStatus: "Failed",
                logData: `Connectivity test failed: ${error.message}`,
                errorDetails: error.message
            });

            return results;
        }
    }
);

/**
 * Comprehensive Tours Status Check
 * Analyzes tour visibility, availability status, and configuration for all tours
 * Provides detailed tour-by-tour reporting and system consistency verification
 * @returns {Promise<Object>} Comprehensive tour status analysis
 */
export const runComprehensiveToursStatusCheck = webMethod(
    Permissions.Anyone,
    async () => {
        try {
            // Get all tours and availability records for comprehensive analysis
            const allTours = await wixData.query("Tours").find();
            const allAvailability = await wixData.query("Availability").find();
            
            if (allTours.items.length === 0) {
                return {
                    status: 'SUCCESS',
                    message: 'No tours found in database',
                    overallStats: {
                        totalTours: 0,
                        visibleTours: 0,
                        hiddenTours: 0,
                        toursWithAvailability: 0,
                        consistencyIssues: 0
                    },
                    tourDetails: [],
                    systemHealth: 'HEALTHY',
                    recommendations: ['Add tours to the system to begin testing.']
                };
            }

            // Create availability mapping for efficient lookup
            const availabilityMap = {};
            allAvailability.items.forEach(av => {
                availabilityMap[av.tourName] = av;
            });

            // Analyze each tour individually with detailed information
            const tourDetails = [];
            const consistencyIssues = [];
            let visibleCount = 0;
            let hiddenCount = 0;
            let visibleWithAvailability = 0;
            let visibleWithoutAvailability = 0;

            for (const tour of allTours.items) {
                // Determine tour visibility status
                const isVisible = tour._publishStatus === 'PUBLISHED' || tour.status === 'visible';
                const hasAvailability = !!availabilityMap[tour._id];
                
                // Get additional tour configuration details
                let highSeasonPolicy = 'None';
                let cancellationPolicy = 'None';
                let operatingDays = [];
                let closedPeriodsInfo = 'None configured';
                
                // Fetch high season policy details
                if (tour.highSeasonPeriods) {
                    try {
                        const highSeasonData = await wixData.get("HighSeasonPeriods", tour.highSeasonPeriods);
                        if (highSeasonData) {
                            highSeasonPolicy = highSeasonData.name;
                        }
                    } catch (error) {
                        console.error('Error fetching high season data for tour:', tour._id, error);
                    }
                }
                
                // Fetch cancellation policy details
                if (tour.cancellationPolicy) {
                    try {
                        const cancellationData = await fetchCancellationPolicy(tour.cancellationPolicy);
                        if (cancellationData) {
                            cancellationPolicy = cancellationData.policyName;
                        }
                    } catch (error) {
                        console.error('Error fetching cancellation policy for tour:', tour._id, error);
                    }
                }
                
                // Extract operating days and process closed periods properly
                operatingDays = tour.runDays || [];
                
                // Check existing availability record for closed periods
                if (hasAvailability) {
                    const closedPeriods = availabilityMap[tour._id].closedPeriods || [];
                    if (Array.isArray(closedPeriods) && closedPeriods.length > 0) {
                        const details = closedPeriods.map(period => {
                            const startDate = `${String(period.startMonth).padStart(2, '0')}-${String(period.startDay).padStart(2, '0')}`;
                            const endDate = `${String(period.endMonth).padStart(2, '0')}-${String(period.endDay).padStart(2, '0')}`;
                            
                            if (period.startMonth === period.endMonth && period.startDay === period.endDay) {
                                return `${startDate} (${period.reason})`;
                            } else {
                                return `${startDate} to ${endDate} (${period.reason})`;
                            }
                        });
                        closedPeriodsInfo = `${closedPeriods.length} periods: ${details.join(', ')}`;
                    }
                }
                
                // Calculate availability statistics if exists
                let availabilityStats = null;
                if (hasAvailability) {
                    const availabilityData = availabilityMap[tour._id].availabilityData || [];
                    availabilityStats = {
                        totalDates: availabilityData.length,
                        availableDates: availabilityData.filter(d => d.status === 'available').length,
                        highSeasonDates: availabilityData.filter(d => d.season === 'high').length,
                        normalSeasonDates: availabilityData.filter(d => d.season === 'normal').length,
                        dateRange: availabilityData.length > 0 ? {
                            from: availabilityData[0].date,
                            to: availabilityData[availabilityData.length - 1].date
                        } : null
                    };
                }
                
                // Determine consistency status and issues
                let consistencyStatus = 'OK';
                let issueDescription = null;
                
                if (isVisible && !hasAvailability) {
                    consistencyStatus = 'ISSUE';
                    issueDescription = 'Visible tour missing availability data';
                    consistencyIssues.push(`Visible tour "${tour.title || tour.urlName}" is missing availability data`);
                    visibleWithoutAvailability++;
                } else if (isVisible && hasAvailability) {
                    visibleWithAvailability++;
                }
                
                // Count visibility
                if (isVisible) {
                    visibleCount++;
                } else {
                    hiddenCount++;
                }
                
                // Create detailed tour entry with corrected labels
                tourDetails.push({
                    tourId: tour._id,
                    title: tour.title || tour.urlName,
                    businessId: tour.tourId, // Business tour ID
                    databaseId: tour._id,    // Database record ID
                    visibility: isVisible ? 'Visible' : 'Hidden',
                    publishStatus: tour._publishStatus || 'Not set',
                    operatingDays: operatingDays,
                    highSeasonPolicy: highSeasonPolicy,
                    cancellationPolicy: cancellationPolicy,
                    closedPeriods: closedPeriodsInfo,
                    hasAvailability: hasAvailability,
                    availabilityStats: availabilityStats,
                    consistencyStatus: consistencyStatus,
                    issueDescription: issueDescription
                });
            }
            
            // Calculate overall system health
            const systemHealth = consistencyIssues.length === 0 ? 'HEALTHY' : 
                                consistencyIssues.length <= 2 ? 'WARNING' : 'NEEDS_ATTENTION';
            
            // Generate comprehensive recommendations
            const recommendations = [];
            if (visibleWithoutAvailability > 0) {
                recommendations.push(`${visibleWithoutAvailability} visible tours need availability data generation.`);
            }
            if (visibleCount === 0) {
                recommendations.push('No visible tours found. Publish tours to make them available for bookings.');
            }
            if (systemHealth === 'HEALTHY') {
                recommendations.push('System is properly configured with no consistency issues.');
            }
            
            return {
                status: 'SUCCESS',
                systemHealth: systemHealth,
                overallStats: {
                    totalTours: allTours.items.length,
                    visibleTours: visibleCount,
                    hiddenTours: hiddenCount,
                    toursWithAvailability: allAvailability.items.length,
                    visibleWithAvailability: visibleWithAvailability,
                    visibleWithoutAvailability: visibleWithoutAvailability,
                    consistencyIssues: consistencyIssues.length
                },
                tourDetails: tourDetails,
                consistencyIssues: consistencyIssues,
                recommendations: recommendations,
                explanation: "This comprehensive analysis examines each tour's visibility status, availability data, and configuration details to ensure system consistency."
            };
            
        } catch (error) {
            console.error('Error in runComprehensiveToursStatusCheck:', error);
            return {
                status: 'FAILED',
                error: error.message,
                systemHealth: 'ERROR'
            };
        }
    }
);

/**
 * Test function to identify tour status fields in Tours collection
 * Analyzes database fields to determine which ones control tour visibility
 * @returns {Promise<Object>} Field identification results with explanations
 */
export const testStatusFieldIdentification = webMethod(
    Permissions.Anyone,
    async () => {
        try {
            // Query multiple tours to get comprehensive field data
            const results = await wixData.query("Tours")
                .limit(5)
                .find();
                
            if (results.items.length > 0) {
                const item = results.items[0];
                const fields = Object.keys(item);
                
                // Filter fields that are actually relevant for tour status
                const statusRelatedFields = fields.filter(field => 
                    field.includes('status') || 
                    field.includes('visible') || 
                    field.includes('publish')
                );
                
                return {
                    status: 'SUCCESS',
                    statusRelatedFields: statusRelatedFields,
                    totalFields: fields.length,
                    sampleTourTitle: item.title || item.urlName,
                    actualFieldValues: {
                        _publishStatus: item._publishStatus,
                        status: item.status || 'Not set'
                    },
                    explanation: "This test identifies which fields control tour visibility in the database."
                };
            }
            
            return { 
                status: 'FAILED',
                error: 'No tours found for field identification',
                statusRelatedFields: []
            };
        } catch (error) {
            console.error('Error in testStatusFieldIdentification:', error);
            return {
                status: 'FAILED',
                error: error.message,
                statusRelatedFields: []
            };
        }
    }
);

/**
 * Analyze availability data for selected tour
 * Provides comprehensive analysis of tour configuration and availability status
 * @param {string} tourId - Database ID of selected tour
 * @returns {Promise<Object>} Detailed tour availability analysis
 */
export const analyzeSelectedTourAvailability = webMethod(
    Permissions.Anyone,
    async (tourId) => {
        try {
            if (!tourId) {
                return {
                    status: 'FAILED',
                    error: 'No tour ID provided for analysis'
                };
            }

            // Get tour data from database
            const tourData = await wixData.get("Tours", tourId);
            if (!tourData) {
                return {
                    status: 'FAILED',
                    error: `Tour with ID ${tourId} not found`
                };
            }

            // Get high season periods configuration
            let highSeasonDetails = { periods: [], policyName: 'None' };
            if (tourData.highSeasonPeriods) {
                try {
                    const highSeasonData = await wixData.get("HighSeasonPeriods", tourData.highSeasonPeriods);
                    if (highSeasonData) {
                        let periods = [];
                        if (highSeasonData.jsonCode) {
                            if (Array.isArray(highSeasonData.jsonCode)) {
                                periods = highSeasonData.jsonCode;
                            } else if (typeof highSeasonData.jsonCode === 'string') {
                                try {
                                    periods = JSON.parse(highSeasonData.jsonCode);
                                } catch (parseError) {
                                    console.error('Error parsing jsonCode:', parseError);
                                }
                            }
                        }
                        highSeasonDetails = {
                            periods: periods,
                            policyName: highSeasonData.name
                        };
                    }
                } catch (error) {
                    console.error('Error fetching high season data:', error);
                }
            }

            // Get cancellation policy configuration
            let cancellationPolicyName = 'None';
            if (tourData.cancellationPolicy) {
                const cancellationPolicy = await fetchCancellationPolicy(tourData.cancellationPolicy);
                if (cancellationPolicy) {
                    cancellationPolicyName = cancellationPolicy.policyName;
                }
            }

            // Process closed periods properly from existing Availability record
            let closedPeriodsInfo = "None configured";
            
            // Get existing availability record to check for closed periods
            const availabilityQuery = await wixData.query("Availability")
                .eq("tourName", tourId)
                .find();
            
            if (availabilityQuery.items.length > 0) {
                const closedPeriods = availabilityQuery.items[0].closedPeriods || [];
                if (Array.isArray(closedPeriods) && closedPeriods.length > 0) {
                    const details = closedPeriods.map(period => {
                        const startDate = `${String(period.startMonth).padStart(2, '0')}-${String(period.startDay).padStart(2, '0')}`;
                        const endDate = `${String(period.endMonth).padStart(2, '0')}-${String(period.endDay).padStart(2, '0')}`;
                        
                        if (period.startMonth === period.endMonth && period.startDay === period.endDay) {
                            return `${startDate} (${period.reason})`;
                        } else {
                            return `${startDate} to ${endDate} (${period.reason})`;
                        }
                    });
                    closedPeriodsInfo = `${closedPeriods.length} periods: ${details.join(', ')}`;
                }
            }

            // Get availability data and statistics
            const hasAvailability = availabilityQuery.items.length > 0;
            let availabilityStats = null;
            
            if (hasAvailability) {
                const availabilityData = availabilityQuery.items[0].availabilityData || [];
                const highSeasonDates = availabilityData.filter(d => d.season === 'high').length;
                const normalSeasonDates = availabilityData.filter(d => d.season === 'normal').length;
                const availableDates = availabilityData.filter(d => d.status === 'available').length;
                
                availabilityStats = {
                    totalDates: availabilityData.length,
                    availableDates: availableDates,
                    highSeasonDates: highSeasonDates,
                    normalSeasonDates: normalSeasonDates,
                    dateRange: availabilityData.length > 0 ? {
                        from: availabilityData[0].date,
                        to: availabilityData[availabilityData.length - 1].date
                    } : null
                };
            }

            return {
                status: 'SUCCESS',
                tourDetails: {
                    title: tourData.title || tourData.urlName,
                    id: tourData._id,
                    tourId: tourData.tourId,      // Business tour ID
                    databaseId: tourData._id,     // Database record ID
                    visibility: tourData._publishStatus || tourData.status || 'Unknown'
                },
                operatingDays: tourData.runDays || [],
                highSeasonPolicy: {
                    name: highSeasonDetails.policyName,
                    periods: highSeasonDetails.periods
                },
                cancellationPolicy: cancellationPolicyName,
                closedPeriods: closedPeriodsInfo,
                availabilityStatus: {
                    hasAvailability: hasAvailability,
                    stats: availabilityStats
                },
                explanation: "This analysis shows complete configuration and availability status for the selected tour."
            };
        } catch (error) {
            console.error('Error in analyzeSelectedTourAvailability:', error);
            return {
                status: 'FAILED',
                error: error.message
            };
        }
    }
);

/**
 * Test availability generation for a specific tour
 * Validates tour availability generation process with comprehensive reporting
 * @param {string} tourUrlName - URL name of the tour
 * @param {boolean} dryRun - If true, simulates without making actual changes
 * @returns {Promise<Object>} Test results
 */
export const testTourAvailabilityGeneration = webMethod(
    Permissions.Anyone,
    async (tourUrlName, dryRun = true) => {
        const testResults = {
            timestamp: new Date(),
            tourUrlName: tourUrlName,
            dryRun: dryRun,
            status: 'UNKNOWN'
        };

        try {
            // Get tour data from database
            const tourQuery = await wixData.query("Tours")
                .eq("urlName", tourUrlName)
                .find();

            if (tourQuery.items.length === 0) {
                testResults.status = 'FAILED';
                testResults.error = `Tour with urlName '${tourUrlName}' not found`;
                return testResults;
            }

            // Extract tour data from first result
            const tourData = tourQuery.items[0];

            // Check if availability already exists
            const existingAvailability = await wixData.query("Availability")
                .eq("tourName", tourData._id)
                .find();

            if (existingAvailability.items.length > 0) {
                testResults.availabilityExists = true;
                
                if (dryRun) {
                    testResults.status = 'DRY_RUN_SUCCESS';
                    testResults.message = `Availability already exists for: ${tourData.title}`;
                    return testResults;
                }
            }

            // Get additional configuration info for comprehensive reporting
            const highSeasonPeriods = [];
            if (tourData.highSeasonPeriods) {
                const highSeasonQuery = await wixData.get("HighSeasonPeriods", tourData.highSeasonPeriods);
                if (highSeasonQuery) {
                    highSeasonPeriods.push(highSeasonQuery);
                }
            }

            const cancellationPolicy = await fetchCancellationPolicy(tourData.cancellationPolicy);

            testResults.tourData = {
                tourId: tourData.tourId,      // Business tour ID
                databaseId: tourData._id,     // Database record ID
                title: tourData.title,
                runDays: tourData.runDays,
                hasClosedPeriods: !!(tourData.closedPeriods && tourData.closedPeriods.length > 0),
                highSeasonPolicy: highSeasonPeriods.length > 0 ? highSeasonPeriods[0].name : "None",
                cancellationPolicy: cancellationPolicy ? cancellationPolicy.policyName : "None"
            };

            if (dryRun) {
                testResults.status = 'DRY_RUN_SUCCESS';
                testResults.simulatedResults = {
                    wouldGenerate: true,
                    estimatedDatesCount: calculateEstimatedDates(),
                    tourHasHours: !!(tourData.hoursOfAvailability && tourData.hoursOfAvailability.length > 0),
                    operatingHours: tourData.hoursOfAvailability || [],
                    message: 'Test completed in dry-run mode - no actual data created'
                };
            } else {
                // Execute actual availability generation
                let result;
                if (existingAvailability.items.length > 0) {
                    result = await generateAvailabilityForTour(tourData._id, true);
                    testResults.status = 'SUCCESS';
                    testResults.actualResults = {
                        regenerated: true,
                        availabilityId: result.availabilityId || existingAvailability.items[0]._id,
                        regeneratedDatesCount: result.regeneratedDatesCount || 0
                    };
                } else {
                    result = await createInitialAvailability(tourData);
                    testResults.status = 'SUCCESS';
                    testResults.actualResults = {
                        created: true,
                        availabilityId: result._id,
                        generatedDatesCount: result.availabilityData.length
                    };
                }
            }

            return testResults;

        } catch (error) {
            testResults.status = 'FAILED';
            testResults.error = error.message;
            return testResults;
        }
    }
);

/**
 * Test manual regeneration for a specific tour
 * Validates manual tour availability regeneration process
 * @param {string} tourUrlName - URL name of the tour
 * @param {boolean} dryRun - If true, simulates without making actual changes
 * @returns {Promise<Object>} Test results
 */
export const testManualRegeneration = webMethod(
    Permissions.Anyone,
    async (tourUrlName, dryRun = true) => {
        const testResults = {
            timestamp: new Date(),
            tourUrlName: tourUrlName,
            dryRun: dryRun,
            status: 'UNKNOWN'
        };

        try {
            // Get tour data for ID resolution
            const tourQuery = await wixData.query("Tours")
                .eq("urlName", tourUrlName)
                .find();
                
            if (tourQuery.items.length === 0) {
                testResults.status = 'FAILED';
                testResults.error = `Tour with urlName '${tourUrlName}' not found`;
                return testResults;
            }
            
            const tourData = tourQuery.items[0];
            const tourId = tourData._id;

            // Get configuration information for reporting
            const highSeasonPeriods = [];
            if (tourData.highSeasonPeriods) {
                const highSeasonQuery = await wixData.get("HighSeasonPeriods", tourData.highSeasonPeriods);
                if (highSeasonQuery) {
                    highSeasonPeriods.push(highSeasonQuery);
                }
            }

            const cancellationPolicy = await fetchCancellationPolicy(tourData.cancellationPolicy);

            if (dryRun) {
                testResults.status = 'DRY_RUN_SUCCESS';
                testResults.message = 'Manual regeneration test completed without changes';
                
                const availabilityExists = await wixData.query("Availability")
                    .eq("tourName", tourId)
                    .find();
                
                testResults.validationResults = {
                    tourExists: true,
                    tourInfo: {
                        title: tourData.title,
                        runDays: tourData.runDays,
                        highSeasonPolicy: highSeasonPeriods.length > 0 ? highSeasonPeriods[0].name : "None",
                        cancellationPolicy: cancellationPolicy ? cancellationPolicy.policyName : "None"
                    },
                    availabilityExists: availabilityExists.items.length > 0,
                    closedPeriodsCount: availabilityExists.items.length > 0 ? 
                        (availabilityExists.items[0].closedPeriods || []).length : 0
                };
            } else {
                // Execute actual regeneration
                const result = await generateAvailabilityForTour(tourId, true);
                testResults.status = 'SUCCESS';
                testResults.regenerationResults = result;
                testResults.tourInfo = {
                    title: tourData.title,
                    runDays: tourData.runDays,
                    highSeasonPolicy: highSeasonPeriods.length > 0 ? highSeasonPeriods[0].name : "None",
                    cancellationPolicy: cancellationPolicy ? cancellationPolicy.policyName : "None"
                };
            }

            return testResults;

        } catch (error) {
            testResults.status = 'FAILED';
            testResults.error = error.message;
            return testResults;
        }
    }
);

/**
 * Get system performance metrics
 * Retrieves and analyzes system performance data
 * @returns {Promise<Object>} System metrics
 */
export const getSystemPerformanceMetrics = webMethod(
    Permissions.Anyone,
    async () => {
        try {
            const stats = await getSystemStatistics();
            const currentTime = new Date();
            
            return {
                timestamp: currentTime,
                totalLogs: stats.totalLogs,
                errorCount: stats.errorCount,
                successfulOperations: stats.successfulOperations,
                recentActivity: stats.recentActivity,
                systemHealth: stats.systemHealth
            };
        } catch (error) {
            return {
                timestamp: new Date(),
                status: 'ERROR',
                error: error.message
            };
        }
    }
);

/**
 * Test monthly update functionality
 * Validates monthly availability update process
 * @param {boolean} dryRun - If true, simulates without making actual changes
 * @returns {Promise<Object>} Test results
 */
export const testMonthlyUpdateProcess = webMethod(
    Permissions.Anyone,
    async (dryRun = true) => {
        const testResults = {
            timestamp: new Date(),
            dryRun: dryRun,
            status: 'UNKNOWN'
        };

        try {
            const availabilityCount = await wixData.query("Availability").find();
            testResults.toursWithAvailability = availabilityCount.totalCount;

            if (testResults.toursWithAvailability === 0) {
                testResults.status = 'SKIPPED';
                testResults.message = 'No tours with availability found - cannot test monthly update';
                return testResults;
            }

            const updateResult = await testMonthlyUpdate(dryRun);
            testResults.status = updateResult.status;
            testResults.updateResults = updateResult;

            return testResults;

        } catch (error) {
            testResults.status = 'FAILED';
            testResults.error = error.message;
            return testResults;
        }
    }
);

/**
 * Run comprehensive system test suite
 * Executes all available system tests with detailed reporting
 * @param {boolean} dryRun - If true, simulates without making actual changes
 * @returns {Promise<Object>} Test results
 */
export const runFullSystemTest = webMethod(
    Permissions.Anyone,
    async (dryRun = true) => {
        const fullTestResults = {
            timestamp: new Date(),
            dryRun: dryRun,
            testPhases: {},
            overallStatus: 'UNKNOWN'
        };

        try {
            console.log('Starting comprehensive system test...');

            // Phase 1: System connectivity
            fullTestResults.testPhases.connectivity = await testSystemConnectivity();

            // Phase 2: Status field identification
            fullTestResults.testPhases.statusField = await testStatusFieldIdentification();

            // Phase 3: Comprehensive Tours Status Check
            fullTestResults.testPhases.toursStatusCheck = await runComprehensiveToursStatusCheck();

            // Phase 4: System health check
            fullTestResults.testPhases.healthCheck = await performSystemHealthCheck();

            // Phase 5: Get sample tour for testing
            const sampleTour = await getSampleTourForTesting();
            if (sampleTour) {
                fullTestResults.testPhases.availabilityGeneration = await testTourAvailabilityGeneration(sampleTour.urlName, dryRun);
            } else {
                fullTestResults.testPhases.availabilityGeneration = {
                    status: 'SKIPPED',
                    message: 'No sample tour available for testing'
                };
            }

            // Phase 6: Test monthly update
            fullTestResults.testPhases.monthlyUpdate = await testMonthlyUpdateProcess(dryRun);

            // Determine overall status
            const failedPhases = Object.values(fullTestResults.testPhases).filter(phase => 
                phase.status === 'FAILED' || phase.overallStatus === 'FAILED'
            );
            
            fullTestResults.overallStatus = failedPhases.length === 0 ? 'SUCCESS' : 'PARTIAL_FAILURE';
            fullTestResults.summary = {
                totalPhases: Object.keys(fullTestResults.testPhases).length,
                successfulPhases: Object.values(fullTestResults.testPhases).filter(phase => 
                    phase.status === 'SUCCESS' || phase.overallStatus === 'SUCCESS'
                ).length,
                failedPhases: failedPhases.length
            };

            // Log comprehensive test results
            await logSystemState({
                stateType: "Full System Test",
                operationType: "SYSTEM_TEST",
                executionStatus: fullTestResults.overallStatus === 'SUCCESS' ? "Completed Successfully" : "Completed with errors",
                logData: `Comprehensive system test completed: ${fullTestResults.overallStatus}. ${fullTestResults.summary.successfulPhases}/${fullTestResults.summary.totalPhases} phases successful. Dry run: ${dryRun}`
            });

            return fullTestResults;

        } catch (error) {
            fullTestResults.overallStatus = 'FAILED';
            fullTestResults.error = error.message;
            
            await logSystemState({
                stateType: "Full System Test",
                operationType: "SYSTEM_TEST",
                executionStatus: "Failed",
                logData: `Comprehensive system test failed: ${error.message}`,
                errorDetails: error.message
            });

            return fullTestResults;
        }
    }
);

/**
 * Run date regeneration for all tours
 * Executes monthly date regeneration process
 * CORRECTED: Now accepts isManual parameter to distinguish manual vs automatic execution
 * @param {boolean} isManual - True if manually triggered from testing page
 * @returns {Promise<Object>} Operation results
 */
export const runDateRegeneration = webMethod(
    Permissions.Anyone,
    async (isManual = true) => {
        return executeMonthlyAvailabilityUpdate(isManual);
    }
);

// Helper functions for internal use

/**
 * Test database access for a specific collection
 * @param {string} collectionName - Collection to test
 * @returns {Promise<Object>} Test results
 */
async function testDatabaseAccess(collectionName) {
    try {
        const testQuery = await wixData.query(collectionName)
            .limit(1)
            .find();

        return {
            status: 'SUCCESS',
            collection: collectionName,
            recordCount: testQuery.totalCount,
            hasData: testQuery.items.length > 0
        };
    } catch (error) {
        return {
            status: 'FAILED',
            collection: collectionName,
            error: error.message
        };
    }
}

/**
 * Calculate estimated number of dates for 18 months
 * @returns {number} Estimated date count
 */
function calculateEstimatedDates() {
    const currentDate = new Date();
    const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endDate = new Date(startDate);
    endDate.setMonth(startDate.getMonth() + 18);
    endDate.setDate(0);
    
    const timeDiff = endDate.getTime() - startDate.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
    
    return daysDiff;
}

/**
 * Get a sample tour for testing purposes
 * @returns {Promise<Object|null>} Sample tour or null
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
