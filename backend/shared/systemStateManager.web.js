import wixData from 'wix-data';

/**
 * System state management and logging utilities
 * Handles logging of system operations, errors, and performance metrics
 * Provides centralized logging for all availability system components
 */

/**
 * Log system state entry to SystemState collection
 * Records system operations with single entry per activity
 * Creates comprehensive entries with all details in logData field
 * @param {Object} logEntry - Log entry object containing state information
 * @returns {Promise<Object|null>} Saved log entry or null on error
 */
export async function logSystemState(logEntry) {
    try {
        // Generate stateId in required format using JST timezone
        if (!logEntry.stateId) {
            const now = new Date();
            const jstDate = new Date(now.getTime() + (9 * 60 * 60 * 1000)); // Convert to JST
            
            const year = jstDate.getFullYear();
            const month = String(jstDate.getMonth() + 1).padStart(2, '0');
            const day = String(jstDate.getDate()).padStart(2, '0');
            const hour = String(jstDate.getHours()).padStart(2, '0');
            const minute = String(jstDate.getMinutes()).padStart(2, '0');
            
            logEntry.stateId = `SYSTEM_LOG_${year}.${month}.${day}_${hour}.${minute}`;
        }
        
        // Set processing timestamps if not provided
        if (!logEntry.processingStartTime) {
            logEntry.processingStartTime = new Date();
        }
        
        if (!logEntry.processingEndTime) {
            logEntry.processingEndTime = new Date();
        }
        
        // Convert object data to JSON string for storage
        if (logEntry.logData && typeof logEntry.logData === 'object') {
            logEntry.logData = JSON.stringify(logEntry.logData);
        }
        
        // Determine operation type based on context and source
        let operationType = determineOperationType(logEntry);
        
        // Normalize execution status to final states only
        let finalExecutionStatus = normalizeExecutionStatus(logEntry.executionStatus);
        
        // Skip logging if this is an intermediate state
        if (finalExecutionStatus === null) {
            return null;
        }
        
        // Create comprehensive log entry with all details
        const cleanLogEntry = {
            stateId: logEntry.stateId,
            stateType: formatStateType(logEntry.stateType),
            operationType: operationType,
            executionStatus: finalExecutionStatus,
            processingStartTime: logEntry.processingStartTime,
            processingEndTime: logEntry.processingEndTime,
            logData: logEntry.logData || "",
            errorDetails: logEntry.errorDetails || "",
            affectedTourCount: logEntry.affectedTourCount || 0,
            affectedTourNames: logEntry.affectedTourNames || [],
            notes: logEntry.notes || ""
        };
        
        // Save single log entry to database
        const savedEntry = await wixData.insert("SystemState", cleanLogEntry);
        
        // Output critical errors to console for immediate attention
        if (finalExecutionStatus === "Failed") {
            console.error("SYSTEM ERROR:", cleanLogEntry);
        }
        
        return savedEntry;
    } catch (error) {
        console.error("Error logging system state:", error);
        // Return null to avoid infinite loops in logging system
        return null;
    }
}

/**
 * Determine operation type based on context and source
 * Analyzes operation type and log data to determine if operation is scheduled or manual
 * @param {Object} logEntry - Log entry object
 * @returns {string} Operation type: "Scheduled Run" or "Manual Run"
 */
function determineOperationType(logEntry) {
    const opType = logEntry.operationType ? logEntry.operationType.toUpperCase() : '';
    const logData = logEntry.logData ? logEntry.logData.toLowerCase() : '';
    const stateType = logEntry.stateType ? logEntry.stateType.toLowerCase() : '';
    
    // Check for scheduled operations
    if (isScheduledOperation(opType, logData, stateType)) {
        return "Scheduled Run";
    }
    
    // All other operations are manual
    return "Manual Run";
}

/**
 * Determine if operation is scheduled or automatic
 * Analyzes various indicators to identify scheduled operations
 * @param {string} opType - Operation type
 * @param {string} logData - Log data content
 * @param {string} stateType - State type
 * @returns {boolean} True if operation is scheduled
 */
function isScheduledOperation(opType, logData, stateType) {
    // Check for explicit manual indicators first (highest priority)
    if (logData.includes('manual execution triggered from testing page') ||
        logData.includes('button click from testing page') ||
        logData.includes('user initiated from testing page') ||
        logData.includes('testing page') ||
        logData.includes('availability manager') ||
        logData.includes('triggered from testing page')) {
        return false;
    }
    
    // Check for explicit scheduled indicators
    if (opType.includes('SCHEDULED') || 
        opType === 'LOG_CLEANUP' ||
        opType === 'LOG_CLEANUP_SCHEDULED') {
        return true;
    }
    
    // Monthly update operations - detailed analysis with specific keyword matching
    if (opType.includes('MONTHLY') || 
        opType.includes('MONTHLYAVAILABILITYUPDATE') ||
        stateType.includes('monthly data update')) {
        
        // Check for scheduled indicators first
        if (logData.includes('scheduled automatic execution at 2200 jst') ||
            logData.includes('automatic execution at 2200 jst') ||
            logData.includes('scheduled execution') ||
            logData.includes('2200 jst') ||
            logData.includes('automated') ||
            logData.includes('cron') ||
            logData.includes('background')) {
            return true;
        }
        
        // Check for manual execution indicators
        if (logData.includes('manual execution triggered from testing page') ||
            logData.includes('manual execution') ||
            logData.includes('testing page') ||
            logData.includes('button')) {
            return false;
        }
        
        // Default for monthly updates without clear indicators is scheduled
        return true;
    }
    
    // Other scheduled indicators
    if (logData.includes('scheduled') ||
        logData.includes('automatic') ||
        logData.includes('automated') ||
        logData.includes('2200 jst') ||
        logData.includes('background task') ||
        logData.includes('cron job')) {
        return true;
    }
    
    // System maintenance and cleanup are typically scheduled
    if (opType.includes('MAINTENANCE') ||
        opType.includes('CLEANUP') ||
        stateType.includes('maintenance') ||
        stateType.includes('cleanup')) {
        return true;
    }
    
    // Default is manual (user-initiated)
    return false;
}

/**
 * Normalize execution status to final states only
 * Converts various status formats to standardized final states
 * @param {string} status - Raw execution status
 * @returns {string|null} Normalized status or null to skip logging
 */
function normalizeExecutionStatus(status) {
    if (!status) {
        return "Completed Successfully";
    }
    
    const normalizedStatus = status.toUpperCase();
    
    // Skip intermediate states
    if (normalizedStatus.includes('PROGRESS') || 
        normalizedStatus.includes('RUNNING') ||
        normalizedStatus.includes('STARTING') ||
        normalizedStatus.includes('PENDING') ||
        normalizedStatus.includes('PROCESSING')) {
        return null; // Skip logging intermediate states
    }
    
    // Map to final states
    if (normalizedStatus.includes('SUCCESS') || 
        normalizedStatus.includes('COMPLETED') ||
        normalizedStatus === 'OK') {
        return "Completed Successfully";
    }
    
    if (normalizedStatus.includes('FAILED') || 
        normalizedStatus.includes('ERROR') ||
        normalizedStatus.includes('EXCEPTION')) {
        return "Failed";
    }
    
    if (normalizedStatus.includes('ALERT') || 
        normalizedStatus.includes('WARNING') ||
        normalizedStatus.includes('PARTIAL') ||
        normalizedStatus.includes('ERRORS')) {
        return "Completed with errors";
    }
    
    // Default for unknown statuses
    return "Completed Successfully";
}

/**
 * Format state type to descriptive format
 * Converts technical state types to user-friendly descriptions
 * @param {string} stateType - Raw state type from system
 * @returns {string} Human-readable state type
 */
function formatStateType(stateType) {
    if (!stateType) return "System Operation";
    
    // Map technical state types to descriptive names
    const stateTypeMapping = {
        'INITLOG': 'Initial Tour Setup',
        'UPDATELOG': 'Monthly Data Update', 
        'INFOLOG': 'System Information',
        'ERRORLOG': 'System Error',
        'System Test': 'System Test',
        'System Health Check': 'System Health Check',
        'Log Cleanup': 'Log Cleanup',
        'SYSTEMCONFIG': 'System Configuration',
        'SYSTEMMAINTENANCE': 'System Maintenance',
        'SYSTEMMONITORING': 'System Monitoring',
        'SYSTEMTESTING': 'System Test',
        'Availability Generation Test': 'Availability Generation Test',
        'Manual Regeneration Test': 'Manual Regeneration Test',
        'Tour Analysis': 'Tour Analysis',
        'Comprehensive Tours Analysis': 'Comprehensive Tours Analysis'
    };
    
    return stateTypeMapping[stateType] || stateType;
}

/**
 * Get comprehensive system statistics
 * Analyzes SystemState collection to provide performance metrics
 * Uses processingEndTime for accurate time-based analysis
 * @returns {Promise<Object>} System statistics with performance data
 */
export async function getSystemStatistics() {
    try {
        // Count total log entries in system
        const totalLogs = await wixData.query('SystemState').count();
        
        // Count error entries using execution status patterns
        const errorQuery = await wixData.query('SystemState')
            .contains('executionStatus', 'Failed')
            .or(
                wixData.query('SystemState').contains('executionStatus', 'errors')
            )
            .count();
        
        // Calculate time threshold for recent activity (24 hours)
        const yesterday = new Date();
        yesterday.setHours(yesterday.getHours() - 24);
        
        // Retrieve recent activity within time window
        const recentActivity = await wixData.query('SystemState')
            .gt('processingEndTime', yesterday)
            .find();
        
        // Filter recent entries to identify errors
        const recentErrors = recentActivity.items.filter(item => 
            item.executionStatus && (
                item.executionStatus.includes('Failed') || 
                item.executionStatus.includes('errors')
            )
        );
        
        // Calculate performance metrics
        const successfulOperations = totalLogs - errorQuery;
        const successRateCalculation = totalLogs > 0 ? ((successfulOperations / totalLogs) * 100) : 100;
        const successRate = Number(successRateCalculation.toFixed(2));
        
        // Determine system health based on error thresholds
        let systemHealth = 'HEALTHY';
        if (recentErrors.length > 5) {
            systemHealth = 'CRITICAL';
        } else if (recentErrors.length > 2 || errorQuery > totalLogs * 0.1) {
            systemHealth = 'WARNING';
        }
        
        // Return comprehensive statistics object
        return {
            totalLogs: totalLogs,
            errorCount: errorQuery,
            successfulOperations: successfulOperations,
            successRate: successRate,
            recentActivity: {
                last24Hours: recentActivity.totalCount,
                recentErrors: recentErrors.length
            },
            systemHealth: systemHealth,
            lastUpdated: new Date()
        };
    } catch (error) {
        console.error('Error getting system statistics:', error);
        // Return default values to maintain API consistency
        return {
            totalLogs: 0,
            errorCount: 0,
            successfulOperations: 0,
            successRate: 0,
            recentActivity: {
                last24Hours: 0,
                recentErrors: 0
            },
            systemHealth: 'UNKNOWN',
            lastUpdated: new Date(),
            error: error.message
        };
    }
}

/**
 * Perform comprehensive system health check
 * Combines multiple metrics to assess overall system health
 * Generates recommendations based on current system state
 * @returns {Promise<Object>} Health check results with recommendations
 */
export async function performSystemHealthCheck() {
    try {
        // Retrieve current system statistics
        const stats = await getSystemStatistics();
        
        // Build comprehensive health check object
        const healthCheck = {
            overallHealth: stats.systemHealth,
            ...stats
        };
        
        // Calculate additional health indicators
        const errorRateCalculation = stats.errorCount > 0 ? (stats.errorCount / stats.totalLogs * 100) : 0;
        const errorRate = Number(errorRateCalculation.toFixed(2));
        
        healthCheck.indicators = {
            databaseConnectivity: 'HEALTHY',
            errorRate: errorRate,
            recentActivityLevel: stats.recentActivity.last24Hours > 0 ? 'ACTIVE' : 'QUIET'
        };
        
        // Generate system recommendations based on health status
        healthCheck.recommendations = [];
        if (stats.systemHealth === 'CRITICAL') {
            healthCheck.recommendations.push('Immediate attention required - high error rate detected');
        } else if (stats.systemHealth === 'WARNING') {
            healthCheck.recommendations.push('Monitor system closely - elevated error rate');
        } else {
            healthCheck.recommendations.push('System operating normally');
        }
        
        // Add recommendation for inactive systems
        if (stats.recentActivity.last24Hours === 0) {
            healthCheck.recommendations.push('No recent activity detected - system may be idle');
        }
        
        // Record health check operation in system logs (single entry)
        await logSystemState({
            stateType: 'System Health Check',
            operationType: 'HEALTH_CHECK',
            executionStatus: 'SUCCESS',
            logData: `Health check completed. Overall Status: ${healthCheck.overallHealth}. Error Rate: ${healthCheck.indicators.errorRate}%. Total Logs: ${stats.totalLogs}. Recent Activity: ${stats.recentActivity.last24Hours} operations in last 24h. Recent Errors: ${stats.recentActivity.recentErrors}. Success Rate: ${stats.successRate}%. Recommendations: ${healthCheck.recommendations.join('; ')}.`,
            affectedTourCount: 0,
            affectedTourNames: []
        });
        
        return healthCheck;
    } catch (error) {
        console.error('Error performing system health check:', error);
        
        // Log failed health check operation (single entry)
        await logSystemState({
            stateType: 'System Health Check',
            operationType: 'HEALTH_CHECK',
            executionStatus: 'FAILED',
            logData: `Health check failed with error: ${error.message}. Stack trace: ${error.stack || 'Not available'}.`,
            errorDetails: error.message,
            affectedTourCount: 0,
            affectedTourNames: []
        });
        
        // Return minimal health check object on error
        return {
            overallHealth: 'UNKNOWN',
            error: error.message,
            recommendations: ['Unable to perform health check - system may have issues']
        };
    }
}

/**
 * Get recent system logs with filtering options
 * Retrieves recent log entries based on specified criteria
 * Supports filtering by state type and time range
 * @param {Object} options - Filter options object
 * @returns {Promise<Object>} Recent logs with metadata
 */
export async function getRecentLogs(options = {}) {
    try {
        // Extract filter parameters with default values
        const {
            limit = 50,
            stateType = null,
            hoursBack = 24
        } = options;
        
        // Calculate time filter for recent logs
        const timeFilter = new Date();
        timeFilter.setHours(timeFilter.getHours() - hoursBack);
        
        // Build base query with time and ordering constraints
        let query = wixData.query('SystemState')
            .gt('processingEndTime', timeFilter)
            .descending('processingEndTime')
            .limit(limit);
        
        // Apply state type filter if specified
        if (stateType) {
            query = query.eq('stateType', stateType);
        }
        
        // Execute query and return results with metadata
        const results = await query.find();
        
        return {
            logs: results.items,
            totalCount: results.totalCount,
            timeRange: {
                from: timeFilter,
                to: new Date()
            },
            filters: { stateType, hoursBack }
        };
    } catch (error) {
        console.error('Error getting recent logs:', error);
        // Return empty result set on error
        return {
            logs: [],
            totalCount: 0,
            error: error.message
        };
    }
}

/**
 * Clean old log entries from database
 * Removes log entries older than specified retention period
 * Processes deletions in batches to prevent timeout issues
 * @param {number} daysToKeep - Number of days to retain logs (default: 90)
 * @returns {Promise<Object>} Cleanup results with statistics
 */
export async function cleanOldLogs(daysToKeep = 90) {
    const startTime = new Date();
    let cutoffDate;
    
    try {
        // Calculate cutoff date for log retention
        cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        
        // Find logs older than cutoff date
        const oldLogsQuery = await wixData.query('SystemState')
            .lt('processingEndTime', cutoffDate)
            .ne('stateType', 'System Configuration') // Preserve system config entries
            .find();
        
        // Return early if no old logs found
        if (oldLogsQuery.items.length === 0) {
            await logSystemState({
                stateType: 'Log Cleanup',
                operationType: 'LOG_CLEANUP_SCHEDULED',
                executionStatus: 'SUCCESS',
                processingStartTime: startTime,
                logData: `Log cleanup operation completed. No old logs found to delete (retention period: ${daysToKeep} days). Cutoff date: ${cutoffDate.toISOString()}. Operation triggered by scheduled maintenance.`,
                affectedTourCount: 0,
                affectedTourNames: []
            });
            
            return {
                success: true,
                deletedCount: 0,
                message: 'No old logs found to delete'
            };
        }
        
        // Process deletions in batches to prevent timeout
        const batchSize = 50;
        let deletedCount = 0;
        const totalToDelete = oldLogsQuery.items.length;
        
        for (let i = 0; i < oldLogsQuery.items.length; i += batchSize) {
            const batch = oldLogsQuery.items.slice(i, i + batchSize);
            
            // Delete each log entry in current batch
            for (const log of batch) {
                await wixData.remove('SystemState', log._id);
                deletedCount++;
            }
            
            // Add pause between batches to prevent system overload
            if (i + batchSize < oldLogsQuery.items.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        const endTime = new Date();
        const duration = (endTime.getTime() - startTime.getTime()) / 1000;
        
        // Record successful cleanup operation (single comprehensive entry)
        await logSystemState({
            stateType: 'Log Cleanup',
            operationType: 'LOG_CLEANUP_SCHEDULED',
            executionStatus: 'SUCCESS',
            processingStartTime: startTime,
            processingEndTime: endTime,
            logData: `Log cleanup operation completed successfully. Deleted ${deletedCount} of ${totalToDelete} old log entries (retention period: ${daysToKeep} days). Cutoff date: ${cutoffDate.toISOString()}. Processing time: ${duration} seconds. Batch size: ${batchSize} entries. Operation triggered by scheduled maintenance.`,
            affectedTourCount: 0,
            affectedTourNames: []
        });
        
        // Return successful cleanup results
        return {
            success: true,
            deletedCount: deletedCount,
            cutoffDate: cutoffDate,
            duration: duration,
            message: `Successfully deleted ${deletedCount} old log entries`
        };
    } catch (error) {
        console.error('Error cleaning old logs:', error);
        
        // Log failed cleanup operation (single comprehensive entry)
        await logSystemState({
            stateType: 'Log Cleanup',
            operationType: 'LOG_CLEANUP_SCHEDULED',
            executionStatus: 'FAILED',
            processingStartTime: startTime,
            processingEndTime: new Date(),
            logData: `Log cleanup operation failed. Error: ${error.message}. Retention period: ${daysToKeep} days. Cutoff date: ${cutoffDate ? cutoffDate.toISOString() : 'Not calculated'}. Stack trace: ${error.stack || 'Not available'}. Operation triggered by scheduled maintenance.`,
            errorDetails: error.message,
            affectedTourCount: 0,
            affectedTourNames: []
        });
        
        // Return error results
        return {
            success: false,
            error: error.message,
            deletedCount: 0
        };
    }
}

/**
 * Get system performance trends over time
 * Analyzes log data to show performance trends by day
 * Groups operations by date and calculates success rates
 * @param {number} days - Number of days to analyze (default: 7)
 * @returns {Promise<Object>} Performance trends with summary statistics
 */
export async function getPerformanceTrends(days = 7) {
    try {
        // Calculate analysis start date
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        // Retrieve logs within analysis period
        const logs = await wixData.query('SystemState')
            .gt('processingEndTime', startDate)
            .find();
        
        // Group logs by day for trend analysis
        const trendData = {};
        logs.items.forEach(log => {
            const day = log.processingEndTime.toISOString().split('T')[0];
            
            // Initialize day data structure if not exists
            if (!trendData[day]) {
                trendData[day] = {
                    date: day,
                    totalOperations: 0,
                    errors: 0,
                    successRate: 100
                };
            }
            
            // Count total operations for the day
            trendData[day].totalOperations++;
            
            // Count errors by checking execution status
            if (log.executionStatus && (
                log.executionStatus.includes('Failed') || 
                log.executionStatus.includes('errors')
            )) {
                trendData[day].errors++;
            }
        });
        
        // Calculate daily success rates
        Object.values(trendData).forEach(day => {
            const calculation = day.totalOperations > 0 ? 
                ((day.totalOperations - day.errors) / day.totalOperations * 100) : 100;
            day.successRate = Number(calculation.toFixed(2));
        });
        
        // Sort trends by date for chronological analysis
        const trends = Object.values(trendData).sort((a, b) => a.date.localeCompare(b.date));
        
        // Calculate summary statistics
        const avgOperations = trends.length > 0 ? 
            (trends.reduce((sum, day) => sum + day.totalOperations, 0) / trends.length) : 0;
        const avgSuccessRate = trends.length > 0 ? 
            (trends.reduce((sum, day) => sum + day.successRate, 0) / trends.length) : 100;
        
        return {
            trends: trends,
            summary: {
                totalDays: days,
                averageOperationsPerDay: Number(avgOperations.toFixed(2)),
                averageSuccessRate: Number(avgSuccessRate.toFixed(2))
            }
        };
    } catch (error) {
        console.error('Error getting performance trends:', error);
        // Return empty trends data on error
        return {
            trends: [],
            summary: {
                totalDays: days,
                averageOperationsPerDay: 0,
                averageSuccessRate: 0
            },
            error: error.message
        };
    }
}
