import wixData from 'wix-data';
import wixFetch from 'wix-fetch';

/**
 * Japanese holidays management system
 * Fetches and manages Japanese national holidays from Google Calendar
 * Updates holidays data annually on December 1st for the following year
 */

/**
 * Fetch Japanese holidays from Google Calendar iCal feed
 * Downloads and parses holiday data for specified year
 * @param {number} year - Year to fetch holidays for
 * @returns {Promise<Array>} Array of holiday objects
 */
export async function fetchJapaneseHolidays(year) {
    try {
        console.log(`Fetching Japanese holidays for year ${year}`);
        
        // Google Calendar iCal URL for Japanese holidays
        const icalUrl = 'https://calendar.google.com/calendar/ical/en.japanese%23holiday%40group.v.calendar.google.com/public/basic.ics';
        
        // Fetch iCal data
        const response = await wixFetch.fetch(icalUrl);
        const icalData = await response.text();
        
        // Parse iCal data to extract holidays
        const holidays = parseICalData(icalData, year);
        
        console.log(`Found ${holidays.length} holidays for year ${year}`);
        return holidays;
        
    } catch (error) {
        console.error('Error fetching Japanese holidays:', error);
        return [];
    }
}

/**
 * Parse iCal data and extract holiday information
 * Processes VEVENT entries from iCal format
 * @param {string} icalData - Raw iCal data
 * @param {number} year - Target year to filter holidays
 * @returns {Array} Parsed holiday objects
 */
function parseICalData(icalData, year) {
    const holidays = [];
    const events = icalData.split('BEGIN:VEVENT');
    
    for (let i = 1; i < events.length; i++) {
        const event = events[i];
        const endEvent = event.indexOf('END:VEVENT');
        const eventData = event.substring(0, endEvent);
        
        // Extract date and summary
        const dtStartMatch = eventData.match(/DTSTART[^:]*:(\d{8})/);
        const summaryMatch = eventData.match(/SUMMARY:(.+)/);
        
        if (dtStartMatch && summaryMatch) {
            const dateStr = dtStartMatch[1];
            const eventYear = parseInt(dateStr.substring(0, 4), 10);
            
            // Filter by target year
            if (eventYear === year) {
                const month = parseInt(dateStr.substring(4, 6), 10);
                const day = parseInt(dateStr.substring(6, 8), 10);
                const name = summaryMatch[1].trim();
                
                holidays.push({
                    year: eventYear,
                    month: month,
                    day: day,
                    date: `${eventYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
                    name: name,
                    source: 'google_calendar'
                });
            }
        }
    }
    
    return holidays.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * Update holidays database with latest data
 * Stores holidays in JapaneseHolidays collection
 * @param {number} year - Year to update holidays for
 * @returns {Promise<Object>} Update result
 */
export async function updateHolidaysDatabase(year) {
    try {
        console.log(`Updating holidays database for year ${year}`);
        
        // Fetch latest holidays
        const holidays = await fetchJapaneseHolidays(year);
        
        if (holidays.length === 0) {
            return {
                success: false,
                message: `No holidays found for year ${year}`
            };
        }
        
        // Check if holidays for this year already exist
        const existingQuery = await wixData.query('JapaneseHolidays')
            .eq('year', year)
            .find();
        
        // Remove existing holidays for this year
        if (existingQuery.items.length > 0) {
            for (const holiday of existingQuery.items) {
                await wixData.remove('JapaneseHolidays', holiday._id);
            }
            console.log(`Removed ${existingQuery.items.length} existing holidays for year ${year}`);
        }
        
        // Insert new holidays
        let insertedCount = 0;
        for (const holiday of holidays) {
            await wixData.insert('JapaneseHolidays', {
                year: holiday.year,
                month: holiday.month,
                day: holiday.day,
                date: holiday.date,
                name: holiday.name,
                source: holiday.source,
                lastUpdated: new Date()
            });
            insertedCount++;
        }
        
        console.log(`Inserted ${insertedCount} holidays for year ${year}`);
        
        return {
            success: true,
            message: `Successfully updated ${insertedCount} holidays for year ${year}`,
            holidaysCount: insertedCount
        };
        
    } catch (error) {
        console.error('Error updating holidays database:', error);
        return {
            success: false,
            message: `Error updating holidays: ${error.message}`
        };
    }
}

/**
 * Get holidays for specific year from database
 * Retrieves stored holiday data with fallback to fetch if not available
 * @param {number} year - Year to get holidays for
 * @returns {Promise<Array>} Array of holiday objects
 */
export async function getHolidaysForYear(year) {
    try {
        // Try to get from database first
        const holidaysQuery = await wixData.query('JapaneseHolidays')
            .eq('year', year)
            .ascending('month')
            .ascending('day')
            .find();
        
        if (holidaysQuery.items.length > 0) {
            console.log(`Found ${holidaysQuery.items.length} holidays in database for year ${year}`);
            return holidaysQuery.items;
        }
        
        // If not in database, fetch and store
        console.log(`No holidays found in database for year ${year}, fetching from Google Calendar`);
        const fetchedHolidays = await fetchJapaneseHolidays(year);
        
        // Store in database for future use
        if (fetchedHolidays.length > 0) {
            await updateHolidaysDatabase(year);
        }
        
        return fetchedHolidays;
        
    } catch (error) {
        console.error('Error getting holidays for year:', error);
        return [];
    }
}

/**
 * Check if specific date is a Japanese holiday
 * Validates date against stored holiday data
 * @param {Date} date - Date to check
 * @returns {Promise<Object>} Holiday information or null
 */
export async function isJapaneseHoliday(date) {
    try {
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        
        const holidays = await getHolidaysForYear(year);
        
        const holiday = holidays.find(h => h.month === month && h.day === day);
        
        return holiday ? {
            isHoliday: true,
            name: holiday.name,
            date: holiday.date
        } : {
            isHoliday: false,
            name: null,
            date: null
        };
        
    } catch (error) {
        console.error('Error checking if date is holiday:', error);
        return {
            isHoliday: false,
            name: null,
            date: null
        };
    }
}

/**
 * Scheduled update function for December 1st
 * Updates holidays for the next year automatically
 * @returns {Promise<Object>} Update result
 */
export async function scheduledHolidayUpdate() {
    try {
        const currentYear = new Date().getFullYear();
        const nextYear = currentYear + 1;
        
        console.log(`Running scheduled holiday update for year ${nextYear}`);
        
        const result = await updateHolidaysDatabase(nextYear);
        
        // Also ensure current year holidays are available
        const currentYearHolidays = await getHolidaysForYear(currentYear);
        if (currentYearHolidays.length === 0) {
            await updateHolidaysDatabase(currentYear);
        }
        
        return result;
        
    } catch (error) {
        console.error('Error in scheduled holiday update:', error);
        return {
            success: false,
            message: `Scheduled update failed: ${error.message}`
        };
    }
}

/**
 * Get holidays for a date range
 * Retrieves holidays within specified date range
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Array>} Array of holidays in range
 */
export async function getHolidaysInRange(startDate, endDate) {
    try {
        const startYear = startDate.getFullYear();
        const endYear = endDate.getFullYear();
        
        let allHolidays = [];
        
        // Get holidays for all years in range
        for (let year = startYear; year <= endYear; year++) {
            const yearHolidays = await getHolidaysForYear(year);
            allHolidays = allHolidays.concat(yearHolidays);
        }
        
        // Filter by date range
        const filteredHolidays = allHolidays.filter(holiday => {
            const holidayDate = new Date(holiday.date);
            return holidayDate >= startDate && holidayDate <= endDate;
        });
        
        return filteredHolidays.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
    } catch (error) {
        console.error('Error getting holidays in range:', error);
        return [];
    }
}

/**
 * Check if date is weekend (Saturday or Sunday)
 * @param {Date} date - Date to check
 * @returns {boolean} True if weekend
 */
export function isWeekend(date) {
    const dayOfWeek = date.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6; // Sunday = 0, Saturday = 6
}

/**
 * Check if date is non-working day (weekend or holiday)
 * @param {Date} date - Date to check
 * @returns {Promise<boolean>} True if non-working day
 */
export async function isNonWorkingDay(date) {
    if (isWeekend(date)) {
        return true;
    }
    
    const holidayInfo = await isJapaneseHoliday(date);
    return holidayInfo.isHoliday;
}

/**
 * Get next working day (not weekend or holiday)
 * @param {Date} date - Starting date
 * @returns {Promise<Date>} Next working day
 */
export async function getNextWorkingDay(date) {
    let checkDate = new Date(date);
    checkDate.setDate(checkDate.getDate() + 1);
    
    while (await isNonWorkingDay(checkDate)) {
        checkDate.setDate(checkDate.getDate() + 1);
    }
    
    return checkDate;
}
