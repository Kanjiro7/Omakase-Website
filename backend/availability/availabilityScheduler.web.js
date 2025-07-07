import wixData from 'wix-data';
import { logSystemState } from 'backend/shared/systemStateManager.web.js';
import { generateAvailabilityForTour } from './availabilityCore.web.js';

/**
 * Automated scheduling system for availability updates
 * Handles monthly scheduled updates and batch processing for all tours
 * Executes at 22:00 JST on the 1st of each month
 */

/**
 * Scheduled job to update availability data monthly
 * Removes previous month dates and adds 18th month dates for all tours
 * @param {boolean} isManual - True if triggered manually by user, false if automatic/scheduled
 * @returns {Promise<Object>} Update statistics and results
 */
export async function executeMonthlyAvailabilityUpdate(isManual = false) {
    const startTime = new Date();
    
    try {
        // Prepare log data based on execution context
        const executionContext = isManual ? 
            'manual execution triggered from testing page' : 
            'scheduled automatic execution at 2200 JST';
        
        // Log operation start for system monitoring
        await logSystemState({
            stateType: 'Monthly Data Update',
            operationType: 'MONTHLYAVAILABILITYUPDATE',
            executionStatus: 'Completed Successfully',
            processingStartTime: startTime,
            logData: `Starting monthly availability update for all tours - ${executionContext} at ${startTime.toISOString()}`,
            affectedTourCount: 0,
            affectedTourNames: []
        });
        
        // Get all active tours using publish status
        const activeTours = await wixData.query('Tours')
            .eq('_publishStatus', 'PUBLISHED')
            .find();
        
        if (activeTours.items.length === 0) {
            await logSystemState({
                stateType: 'Monthly Data Update',
                operationType: 'MONTHLYAVAILABILITYUPDATE',
                executionStatus: 'Completed Successfully',
                processingStartTime: startTime,
                processingEndTime: new Date(),
                logData: `No active tours found for monthly update - ${executionContext}`,
                affectedTourCount: 0,
                affectedTourNames: []
            });
            
            return {
                success: true,
                message: 'No active tours found for update',
                toursUpdated: 0
            };
        }
        
        // Process tours in batches to avoid overloading system
        const chunkSize = 10;
        let successCount = 0;
        let errorCount = 0;
        let errorMessages = [];
        let successfulTours = [];
        let failedTours = [];
        
        for (let i = 0; i < activeTours.items.length; i += chunkSize) {
            const chunk = activeTours.items.slice(i, i + chunkSize);
            
            // Process each tour in the chunk using Promise.allSettled for error isolation
            const results = await Promise.allSettled(
                chunk.map(tour => generateAvailabilityForTour(tour._id, false))
            );
            
            // Count successes and errors with JavaScript-compatible handling
            results.forEach((result, index) => {
                const tour = chunk[index];
                if (result.status === 'fulfilled') {
                    successCount++;
                    successfulTours.push(`${tour.title || tour.urlName}`);
                } else {
                    errorCount++;
                    const errorMessage = result.reason && result.reason.message ? 
                        result.reason.message : 
                        String(result.reason) || 'Unknown error';
                    const tourName = `${tour.title || tour.urlName} (ID: ${tour._id})`;
                    errorMessages.push(`Error updating tour ${tourName}: ${errorMessage}`);
                    failedTours.push(tourName);
                }
            });
            
            // Pause between chunks to avoid overwhelming the system
            if (i + chunkSize < activeTours.items.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        // Calculate execution metrics
        const endTime = new Date();
        const duration = (endTime.getTime() - startTime.getTime()) / 1000;
        
        // Determine final execution status
        const executionStatus = errorCount === 0 ? 
            'Completed Successfully' : 
            'Completed with errors';
        
        // Log completion with detailed results
        await logSystemState({
            stateType: 'Monthly Data Update',
            operationType: 'MONTHLYAVAILABILITYUPDATE',
            executionStatus: executionStatus,
            processingStartTime: startTime,
            processingEndTime: endTime,
            logData: `Monthly availability update completed in ${duration.toFixed(2)} seconds - ${executionContext}. ${successCount} tours updated successfully, ${errorCount} errors.`,
            errorDetails: errorMessages.join('; '),
            affectedTourCount: successCount,
            affectedTourNames: successfulTours
        });
        
        return {
            success: true,
            toursProcessed: activeTours.items.length,
            toursUpdated: successCount,
            toursFailed: errorCount,
            errors: errorMessages,
            executionTime: duration,
            successfulTours: successfulTours,
            failedTours: failedTours
        };
        
    } catch (error) {
        const endTime = new Date();
        const executionContext = isManual ? 
            'manual execution triggered from testing page' : 
            'scheduled automatic execution';
        
        // Log critical system error
        await logSystemState({
            stateType: 'Monthly Data Update',
            operationType: 'MONTHLYAVAILABILITYUPDATE',
            executionStatus: 'Failed',
            processingStartTime: startTime,
            processingEndTime: endTime,
            logData: `Monthly availability update failed - ${executionContext}: ${error.message}`,
            errorDetails: error.message,
            affectedTourCount: 0,
            affectedTourNames: []
        });
        
        return {
            success: false,
            error: error.message,
            errorDetails: error.stack
        };
    }
}

/**
 * Test function for monthly update with enhanced logging and validation
 * Always treated as manual operation since it's for testing purposes
 * @param {boolean} dryRun - If true, simulates without making actual changes
 * @returns {Promise<Object>} Test results and validation data
 */
export async function testMonthlyUpdate(dryRun = true) {
    const startTime = new Date();
    
    try {
        // Log test start for system monitoring (always manual from testing page)
        await logSystemState({
            stateType: 'System Test',
            operationType: 'SYSTEM_TEST',
            executionStatus: 'Completed Successfully',
            processingStartTime: startTime,
            logData: `Testing monthly update procedure from testing page - manual button click - dry run: ${dryRun}`,
            affectedTourCount: 0,
            affectedTourNames: []
        });
        
        // Get sample of active tours (limit to 5 for testing)
        const activeTours = await wixData.query('Tours')
            .eq('_publishStatus', 'PUBLISHED')
            .limit(5)
            .find();
        
        if (activeTours.items.length === 0) {
            return {
                status: 'SUCCESS',
                message: 'No active tours found for test',
                dryRun: dryRun,
                tourCount: 0
            };
        }
        
        if (dryRun) {
            // Simulate without actual changes
            return {
                status: 'SUCCESS',
                message: `Would update ${activeTours.items.length} tours (dry run)`,
                tourCount: activeTours.items.length,
                sampleTours: activeTours.items.map(tour => ({
                    id: tour._id,
                    title: tour.title,
                    urlName: tour.urlName
                })),
                dryRun: true
            };
        } else {
            // Actually run update on sample tours
            const results = await Promise.allSettled(
                activeTours.items.map(tour => generateAvailabilityForTour(tour._id, false))
            );
            
            // JavaScript-compatible result processing
            const successResults = [];
            const errorResults = [];
            
            results.forEach((result, index) => {
                const tour = activeTours.items[index];
                if (result.status === 'fulfilled') {
                    successResults.push(result.value);
                } else {
                    errorResults.push(result.reason);
                }
            });
            
            return {
                status: 'SUCCESS',
                message: `Updated ${successResults.length} of ${activeTours.items.length} tours`,
                tourCount: activeTours.items.length,
                successCount: successResults.length,
                errorCount: errorResults.length,
                successResults: successResults,
                errorMessages: errorResults.map(e => e && e.message ? e.message : String(e)),
                dryRun: false
            };
        }
        
    } catch (error) {
        return {
            status: 'FAILED',
            error: error.message,
            dryRun: dryRun
        };
    }
}

/**
 * Helper function to sort availability data by date using JavaScript date arithmetic
 * @param {Array} availabilityData - Array of availability objects
 * @returns {Array} Sorted array by date
 */
export function sortAvailabilityByDate(availabilityData) {
    return availabilityData.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateA - dateB;
    });
}

/**
 * Helper function to calculate date difference in days using JavaScript
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {number} Difference in days
 */
export function calculateDateDifference(startDate, endDate) {
    const timeDiff = endDate.getTime() - startDate.getTime();
    return Math.ceil(timeDiff / (1000 * 3600 * 24));
}

/**
 * Helper function to get current date in JST timezone
 * @returns {Date} Current date adjusted to JST
 */
export function getCurrentJSTDate() {
    const now = new Date();
    const jstOffset = 9 * 60 * 60 * 1000; // JST is UTC+9
    return new Date(now.getTime() + jstOffset);
}
