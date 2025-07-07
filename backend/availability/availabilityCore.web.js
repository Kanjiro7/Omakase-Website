// File: backend/availability/availabilityCore.web.js
// Directory: backend/availability
//
// This module manages tour availability generation, regeneration, and monthly rotation.
// It provides helper utilities to check high-season periods, closed periods, and run days.
// All public functions return Promises and log execution details through logSystemState.

import wixData from 'wix-data';
import { logSystemState } from 'backend/shared/systemStateManager.web.js';

/**
 * Core availability management system
 * Handles generation, regeneration and data processing for tour availability
 * Maintains closed periods and existing booking data integrity
 */

/**
 * Helper function to format closed periods for logging
 * Processes closedPeriods array to provide human-readable information
 * @param {Array} closedPeriods - Array of closed period objects
 * @returns {Object} Formatted closed periods information
 */
function formatClosedPeriodsForLogging(closedPeriods) {
    if (!closedPeriods || !Array.isArray(closedPeriods) || closedPeriods.length === 0) {
        return {
            count: 0,
            summary: "None configured",
            details: []
        };
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
    
    return {
        count: closedPeriods.length,
        summary: `${closedPeriods.length} periods configured`,
        details: details
    };
}

/**
 * Creates initial availability for a tour when it becomes visible
 * Generates 18 months of availability starting from first day of current month
 * @param {Object} tourData - Tour data from Tours collection
 * @returns {Promise<Object>} - Created availability record
 */
export async function createInitialAvailability(tourData) {
    const logBuffer = [];
    const startTime = new Date();
    
    try {
        // Get tour information to ensure proper ID connection
        const tourId = tourData._id; // This is the actual database ID
        logBuffer.push(`Starting availability generation for tour: ${tourData.title || tourData.urlName}`);
        logBuffer.push(`Tour ID: ${tourData.tourId || 'Not set'}`);
        logBuffer.push(`Database ID: ${tourId}`);
        
        // Check if availability already exists
        const existingQuery = await wixData.query("Availability")
            .eq("tourName", tourId)
            .find();
            
        if (existingQuery.items.length > 0) {
            logBuffer.push(`Availability already exists for tour: ${tourData.title || tourData.urlName}`);
            throw new Error(`Availability already exists for: ${tourData.title || tourData.urlName}`);
        }

        // Calculate 18 month period starting from first day of current month in JST
        const currentDate = new Date();
        const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        startDate.setHours(9, 0, 0, 0); // 9AM JST
        const endDate = new Date(startDate);
        endDate.setMonth(startDate.getMonth() + 18); // 18 months ahead
        endDate.setDate(0); // Last day of 18th month
        
        logBuffer.push(`Generating dates from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

        // Get high season periods and cancellation policy for proper season tagging
        const highSeasonData = await fetchHighSeasonPeriods(tourData.highSeasonPeriods);
        const cancellationPolicy = await fetchCancellationPolicy(tourData.cancellationPolicy);
        
        logBuffer.push(`Retrieved ${highSeasonData.periods.length} high season periods from policy: ${highSeasonData.policyName || 'None'}`);
        logBuffer.push(`Cancellation Policy: ${cancellationPolicy ? cancellationPolicy.policyName : 'None'}`);
        
        // Process closed periods from tour data and log them
        const closedPeriods = tourData.closedPeriods || [];
        const closedPeriodsInfo = formatClosedPeriodsForLogging(closedPeriods);
        logBuffer.push(`Closed Periods: ${closedPeriodsInfo.summary}`);
        if (closedPeriodsInfo.details.length > 0) {
            closedPeriodsInfo.details.forEach(detail => {
                logBuffer.push(`  - ${detail}`);
            });
        }
        
        // Generate availability data with proper status and season
        const availabilityData = generateAvailabilityData(startDate, endDate, tourData, highSeasonData.periods, closedPeriods);
        
        logBuffer.push(`Generated ${availabilityData.length} availability dates`);

        // Create availability record with proper tour reference - PRESERVE closed periods
        const availabilityRecord = {
            availabilityId: `${tourData.urlName} Availability`,
            tourName: tourId, // Using actual tour ID for proper reference
            tourId: tourData.tourId, // Business ID (e.g., OM001)
            notes: "",
            availabilityData: availabilityData,
            closedPeriods: closedPeriods // Store and preserve closed periods
        };

        // Save to database
        const savedRecord = await wixData.insert("Availability", availabilityRecord);
        
        const endTime = new Date();
        logBuffer.push(`Successfully created availability for tour: ${tourData.title || tourData.urlName}. Duration: ${((endTime.getTime() - startTime.getTime()) / 1000).toFixed(2)}s`);

        // Log success to SystemState
        await logSystemState({
            stateType: "Selected Tour Date Generation",
            stateCategory: "AVAILABILITY_OPERATIONS",
            executionStatus: "Execution Completed",
            processingStartTime: startTime,
            processingEndTime: endTime,
            logData: logBuffer.join('\n'),
            errorDetails: "",
            affectedTourCount: 1,
            affectedTourNames: [tourData.title || tourData.urlName]
        });

        return savedRecord;
    } catch (error) {
        const endTime = new Date();
        logBuffer.push(`ERROR: Failed to create availability for tour: ${tourData.title || tourData.urlName || "unknown"}. Error: ${error.message}`);
        
        // Log error to SystemState
        await logSystemState({
            stateType: "Selected Tour Date Generation",
            stateCategory: "AVAILABILITY_OPERATIONS", 
            executionStatus: "Executed with errors",
            processingStartTime: startTime,
            processingEndTime: endTime,
            logData: logBuffer.join('\n'),
            errorDetails: error.message,
            affectedTourCount: 0,
            affectedTourNames: [tourData.title || tourData.urlName || "unknown"]
        });
        
        throw error;
    }
}

/**
 * Regenerates availability for a specific tour
 * Maintains booked participants and preserves closed periods
 * @param {string} tourId - The database ID of the tour
 * @param {boolean} isManualUpdate - Whether this is a manual update (affects behavior)
 * @returns {Promise<Object>} - Update operation result
 */
export async function generateAvailabilityForTour(tourId, isManualUpdate = true) {
    const logBuffer = [];
    const startTime = new Date();
    
    try {
        // Get tour data using ID
        const tourQuery = await wixData.get("Tours", tourId);
        if (!tourQuery) {
            throw new Error(`Tour with ID ${tourId} not found`);
        }
        
        const tourData = tourQuery;
        logBuffer.push(`Starting ${isManualUpdate ? 'manual' : 'scheduled'} regeneration for tour: ${tourData.title || tourData.urlName}`);
        logBuffer.push(`Tour ID: ${tourData.tourId || 'Not set'}`);
        logBuffer.push(`Database ID: ${tourId}`);

        // Get existing availability record
        const availabilityQuery = await wixData.query("Availability")
            .eq("tourName", tourId)
            .find();

        if (availabilityQuery.items.length === 0) {
            // If no availability exists, create new
            logBuffer.push(`No existing availability found, creating new availability`);
            return createInitialAvailability(tourData);
        }

        const existingAvailability = availabilityQuery.items[0];
        
        // Get high season periods and cancellation policy for proper season tagging
        const highSeasonData = await fetchHighSeasonPeriods(tourData.highSeasonPeriods);
        const cancellationPolicy = await fetchCancellationPolicy(tourData.cancellationPolicy);
        
        logBuffer.push(`Retrieved ${highSeasonData.periods.length} high season periods from policy: ${highSeasonData.policyName || 'None'}`);
        logBuffer.push(`Cancellation Policy: ${cancellationPolicy ? cancellationPolicy.policyName : 'None'}`);

        // PRESERVE existing closed periods from Availability record - never overwrite
        const existingClosedPeriods = existingAvailability.closedPeriods || [];
        const closedPeriodsInfo = formatClosedPeriodsForLogging(existingClosedPeriods);
        logBuffer.push(`Closed Periods: ${closedPeriodsInfo.summary}`);
        if (closedPeriodsInfo.details.length > 0) {
            closedPeriodsInfo.details.forEach(detail => {
                logBuffer.push(`  - ${detail}`);
            });
        }

        // Calculate date ranges for update
        const currentDate = new Date();
        currentDate.setHours(9, 0, 0, 0); // 9AM JST
        let startDate, endDate;
        
        if (isManualUpdate) {
            // Manual update: start from first day of current month
            startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            endDate = new Date(startDate);
            endDate.setMonth(startDate.getMonth() + 18);
            endDate.setDate(0); // Last day of 18th month
            logBuffer.push(`Manual update: regenerating full 18-month period from ${startDate.toISOString().split('T')[0]}`);
        } else {
            // Scheduled update: remove previous month, add 18th month
            const prevMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
            const prevMonthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);
            startDate = prevMonthStart;
            endDate = new Date(currentDate);
            endDate.setMonth(endDate.getMonth() + 18);
            endDate.setDate(0);
            logBuffer.push(`Scheduled update: removing ${prevMonthStart.toISOString().split('T')[0]} to ${prevMonthEnd.toISOString().split('T')[0]}, adding month ${endDate.toISOString().split('T')[0]}`);
        }

        // Process existing data differently based on update type
        let updatedAvailabilityData;
        
        if (isManualUpdate) {
            // Manual update: regenerate all data but maintain bookedParticipants and custom statuses
            updatedAvailabilityData = regenerateWithPreservedBookings(
                startDate, 
                endDate,
                tourData,
                highSeasonData.periods,
                existingAvailability.availabilityData,
                existingClosedPeriods // Use existing closed periods
            );
            logBuffer.push(`Manual regeneration completed: ${updatedAvailabilityData.length} dates updated`);
        } else {
            // Scheduled update: only remove previous month and add new month
            updatedAvailabilityData = rotateAvailabilityMonths(
                currentDate,
                tourData,
                highSeasonData.periods,
                existingAvailability.availabilityData,
                existingClosedPeriods // Use existing closed periods
            );
            logBuffer.push(`Scheduled rotation completed: ${updatedAvailabilityData.length} dates in array`);
        }

        // Update the availability record - PRESERVE existing closed periods
        existingAvailability.availabilityData = updatedAvailabilityData;
        // DO NOT MODIFY closedPeriods - keep existing values
        const updatedRecord = await wixData.update("Availability", existingAvailability);

        const endTime = new Date();
        logBuffer.push(`Successfully ${isManualUpdate ? 'regenerated' : 'updated'} availability for tour: ${tourData.title || tourData.urlName}. Duration: ${((endTime.getTime() - startTime.getTime()) / 1000).toFixed(2)}s`);

        // Log success to SystemState
        await logSystemState({
            stateType: isManualUpdate ? "Selected Tour Date Regeneration" : "Monthly Data Update",
            stateCategory: "AVAILABILITY_OPERATIONS",
            executionStatus: "Execution Completed",
            processingStartTime: startTime,
            processingEndTime: endTime,
            logData: logBuffer.join('\n'),
            errorDetails: "",
            affectedTourCount: 1,
            affectedTourNames: [tourData.title || tourData.urlName]
        });

        return {
            status: "SUCCESS",
            tourId: tourId,
            tourName: tourData.urlName,
            regeneratedDatesCount: updatedAvailabilityData.length
        };
    } catch (error) {
        const endTime = new Date();
        logBuffer.push(`ERROR: Failed to ${isManualUpdate ? 'regenerate' : 'update'} availability for tour ID: ${tourId}. Error: ${error.message}`);
        
        // Log error to SystemState
        await logSystemState({
            stateType: isManualUpdate ? "Selected Tour Date Regeneration" : "Monthly Data Update",
            stateCategory: "AVAILABILITY_OPERATIONS",
            executionStatus: "Executed with errors",
            processingStartTime: startTime,
            processingEndTime: endTime,
            logData: logBuffer.join('\n'),
            errorDetails: error.message,
            affectedTourCount: 0,
            affectedTourNames: [tourId]
        });
        
        throw error;
    }
}

/**
 * Fetches high season periods from HighSeasonPeriods collection with proper jsonCode parsing
 * @param {string} highSeasonId - Single HighSeasonPeriods reference ID  
 * @returns {Promise<Object>} - High season data with periods and policy name
 */
async function fetchHighSeasonPeriods(highSeasonId) {
    if (!highSeasonId) {
        return { periods: [], policyName: null };
    }
    
    try {
        // Reference field contains single ID, not array
        const result = await wixData.get("HighSeasonPeriods", highSeasonId);
            
        if (!result) {
            return { periods: [], policyName: null };
        }
        
        // Parse jsonCode field and return periods with policy name
        let periods = [];
        if (result.jsonCode && Array.isArray(result.jsonCode)) {
            // jsonCode is already parsed as array
            periods = result.jsonCode;
        } else if (result.jsonCode && typeof result.jsonCode === 'string') {
            // jsonCode is string, needs parsing
            try {
                periods = JSON.parse(result.jsonCode);
                if (!Array.isArray(periods)) {
                    periods = [];
                }
            } catch (parseError) {
                console.error('Error parsing jsonCode:', parseError);
                periods = [];
            }
        }
        
        return {
            periods: periods,
            policyName: result.name
        };
    } catch (error) {
        console.error("Error fetching high season periods:", error);
        return { periods: [], policyName: null };
    }
}

/**
 * Fetches cancellation policy from CancellationPolicies collection
 * @param {string} cancellationPolicyId - Single CancellationPolicies reference ID
 * @returns {Promise<Object|null>} - Cancellation policy data
 */
export async function fetchCancellationPolicy(cancellationPolicyId) {
    if (!cancellationPolicyId) {
        console.log("No cancellation policy ID provided");
        return null;
    }
    
    try {
        // Reference field contains single ID, get the record directly
        const result = await wixData.get("CancellationPolicies", cancellationPolicyId);
        
        if (!result) {
            console.log(`No cancellation policy found for ID: ${cancellationPolicyId}`);
            return null;
        }
        
        console.log(`Successfully fetched cancellation policy: ${result.policyName}`);
        return result;
    } catch (error) {
        console.error("Error fetching cancellation policy:", error);
        return null;
    }
}

/**
 * Generates availability data for date range with proper status and season detection
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {Object} tourData - Tour data
 * @param {Array} highSeasonPeriods - High season periods data with parsed jsonCode
 * @param {Array} closedPeriods - Closed periods array with new format
 * @returns {Array} - Generated availability data
 */
function generateAvailabilityData(startDate, endDate, tourData, highSeasonPeriods, closedPeriods) {
    const availabilityData = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
        const dateString = currentDate.toISOString().split('T')[0];
        
        // Check if date is in closed periods using new format
        const isClosedDate = isDateInClosedPeriods(currentDate, closedPeriods);
        
        // Determine if tour operates on this day based on runDays
        const isOperatingDay = !isClosedDate && isDateOperatingDay(currentDate, tourData.runDays);
        
        // Check high season detection
        const isHighSeason = checkDateInHighSeasonPeriods(currentDate, highSeasonPeriods);
        
        // Create availability entry
        availabilityData.push({
            date: dateString,
            status: isOperatingDay ? "available" : "notoperating",
            bookedParticipants: 0,
            season: isHighSeason ? "high" : "normal"
        });
        
        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return availabilityData;
}

/**
 * Checks if a date is an operating day based on runDays tags
 * @param {Date} date - Date to check
 * @param {Array} runDays - Array of day names (e.g., ["Monday", "Tuesday", ...])
 * @returns {boolean} - True if date is an operating day
 */
function isDateOperatingDay(date, runDays) {
    if (!runDays || !Array.isArray(runDays) || runDays.length === 0) {
        return false;
    }
    
    const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDayName = dayNames[dayOfWeek];
    
    // Check if current day name is in runDays array
    return runDays.includes(currentDayName);
}

/**
 * Checks if a date falls within high season periods with proper cross-year support
 * @param {Date} date - Date to check
 * @param {Array} highSeasonPeriods - Array of high season period objects with from/to
 * @returns {boolean} - True if date is in high season
 */
function checkDateInHighSeasonPeriods(date, highSeasonPeriods) {
    if (!highSeasonPeriods || highSeasonPeriods.length === 0) {
        return false;
    }
    
    const month = date.getMonth() + 1; // 1-12
    const day = date.getDate();
    
    // Check if date falls within any high season period
    return highSeasonPeriods.some(period => {
        if (!period.from || !period.to) {
            return false;
        }
        
        // Parse from and to dates (format: "MM-DD")
        const [fromMonth, fromDay] = period.from.split('-').map(Number);
        const [toMonth, toDay] = period.to.split('-').map(Number);
        
        // Handle cross-year periods (e.g., "12-30" to "01-03")
        if (fromMonth > toMonth) {
            // Cross-year period
            if (month >= fromMonth || month <= toMonth) {
                if (month === fromMonth && day >= fromDay) return true;
                if (month === toMonth && day <= toDay) return true;
                if (month > fromMonth || month < toMonth) return true;
            }
        } else {
            // Same year period
            if (month >= fromMonth && month <= toMonth) {
                if (month === fromMonth && day >= fromDay) return true;
                if (month === toMonth && day <= toDay) return true;
                if (month > fromMonth && month < toMonth) return true;
            }
        }
        
        return false;
    });
}

/**
 * Checks if a date is in closed periods using new JSON format
 * Complete implementation to handle new closedPeriods format with startMonth/startDay/endMonth/endDay
 * @param {Date} date - Date to check
 * @param {Array} closedPeriods - Array of closed period objects with new format
 * @returns {boolean} - True if date is in closed periods
 */
function isDateInClosedPeriods(date, closedPeriods) {
    if (!closedPeriods || closedPeriods.length === 0) {
        return false;
    }
    
    const month = date.getMonth() + 1; // 1-12 (JavaScript month is 0-based)
    const day = date.getDate(); // 1-31
    
    // Check if date falls within any closed period
    return closedPeriods.some(period => {
        if (!period.startMonth || !period.startDay || !period.endMonth || !period.endDay) {
            return false;
        }
        
        const startMonth = period.startMonth;
        const startDay = period.startDay;
        const endMonth = period.endMonth;
        const endDay = period.endDay;
        
        // Handle cross-year periods (e.g., Dec 24 to Jan 6)
        if (startMonth > endMonth) {
            // Cross-year period: check if date is in either end of year or beginning of next year
            if (month >= startMonth || month <= endMonth) {
                // Check start month
                if (month === startMonth && day >= startDay) return true;
                // Check end month
                if (month === endMonth && day <= endDay) return true;
                // Check months in between
                if (month > startMonth || month < endMonth) return true;
            }
        } else {
            // Same year period: normal range check
            if (month >= startMonth && month <= endMonth) {
                // Single day
                if (startMonth === endMonth && startDay === endDay) {
                    return month === startMonth && day === startDay;
                }
                // Same month range
                else if (startMonth === endMonth) {
                    return month === startMonth && day >= startDay && day <= endDay;
                }
                // Multi-month range
                else {
                    if (month === startMonth && day >= startDay) return true;
                    if (month === endMonth && day <= endDay) return true;
                    if (month > startMonth && month < endMonth) return true;
                }
            }
        }
        
        return false;
    });
}

/**
 * Regenerates availability data while preserving booking information
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {Object} tourData - Tour data
 * @param {Array} highSeasonPeriods - High season periods
 * @param {Array} existingData - Existing availability data
 * @param {Array} closedPeriods - Closed periods with new format
 * @returns {Array} - Updated availability data
 */
function regenerateWithPreservedBookings(startDate, endDate, tourData, highSeasonPeriods, existingData, closedPeriods) {
    // Create a map of existing data for quick lookup
    const existingDataMap = {};
    existingData.forEach(item => {
        existingDataMap[item.date] = item;
    });
    
    // Generate new data
    const newData = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
        const dateString = currentDate.toISOString().split('T')[0];
        
        // Check if date is in closed periods using new format
        const isClosedDate = isDateInClosedPeriods(currentDate, closedPeriods);
        
        // Determine if tour operates on this day based on runDays
        const isOperatingDay = !isClosedDate && isDateOperatingDay(currentDate, tourData.runDays);
        
        // Determine season based on high season periods
        const isHighSeason = checkDateInHighSeasonPeriods(currentDate, highSeasonPeriods);
        
        // Create new entry, preserving booking information if exists
        const existingEntry = existingDataMap[dateString];
        
        const newEntry = {
            date: dateString,
            status: isOperatingDay ? "available" : "notoperating",
            bookedParticipants: existingEntry ? existingEntry.bookedParticipants : 0,
            season: isHighSeason ? "high" : "normal"
        };
        
        // Preserve custom statuses and time slots if exist
        if (existingEntry) {
            if (existingEntry.status === "soldout" || existingEntry.status === "partiallysoldout") {
                newEntry.status = existingEntry.status;
            }
            if (existingEntry.timeSlots) {
                newEntry.timeSlots = existingEntry.timeSlots;
            }
        }
        
        newData.push(newEntry);
        
        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return newData;
}

/**
 * Rotates availability months: removes past month, adds future month
 * Preserves all existing availability information
 * @param {Date} currentDate - Current date
 * @param {Object} tourData - Tour data
 * @param {Array} highSeasonPeriods - High season periods
 * @param {Array} existingData - Existing availability data
 * @param {Array} closedPeriods - Closed periods with new format
 * @returns {Array} - Updated availability data
 */
function rotateAvailabilityMonths(currentDate, tourData, highSeasonPeriods, existingData, closedPeriods) {
    // Define previous month range for removal
    const prevMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    const prevMonthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);
    
    // Filter out COMPLETE previous month (fix for first day remaining)
    const filteredData = existingData.filter(item => {
        const itemDate = new Date(item.date);
        // Exclude ALL dates in previous month range
        return !(itemDate >= prevMonthStart && itemDate <= prevMonthEnd);
    });
    
    // Define future month range for addition
    const futureMonthStart = new Date(currentDate);
    futureMonthStart.setMonth(futureMonthStart.getMonth() + 17); // Month 18
    futureMonthStart.setDate(1);
    
    const futureMonthEnd = new Date(futureMonthStart);
    futureMonthEnd.setMonth(futureMonthEnd.getMonth() + 1);
    futureMonthEnd.setDate(0);
    
    // Generate new future month data
    const newMonthData = [];
    const genDate = new Date(futureMonthStart);
    
    while (genDate <= futureMonthEnd) {
        const dateString = genDate.toISOString().split('T')[0];
        
        // Skip if date already exists
        if (filteredData.some(item => item.date === dateString)) {
            genDate.setDate(genDate.getDate() + 1);
            continue;
        }
        
        // Check if date is in closed periods using new format
        const isClosedDate = isDateInClosedPeriods(genDate, closedPeriods);
        
        // Determine if tour operates on this day
        const isOperatingDay = !isClosedDate && isDateOperatingDay(genDate, tourData.runDays);
        
        // Determine season
        const isHighSeason = checkDateInHighSeasonPeriods(genDate, highSeasonPeriods);
        
        // Create new entry
        newMonthData.push({
            date: dateString,
            status: isOperatingDay ? "available" : "notoperating",
            bookedParticipants: 0,
            season: isHighSeason ? "high" : "normal"
        });
        
        // Move to next day
        genDate.setDate(genDate.getDate() + 1);
    }
    
    // Combine filtered existing data with new month data and sort
    const combinedData = [...filteredData, ...newMonthData];
    return combinedData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
