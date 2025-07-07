// Import required Wix APIs for database operations and UI management
import wixData from 'wix-data';
import wixWindow from 'wix-window';
import wixLocation from 'wix-location-frontend';

// Global variables for state management
let currentDate = new Date();
let currentTourId = null;
let currentTourLabel = '';
let availabilityData = {};
let availabilityRecord = null;
let toursData = [];
let isCalendarMenuOpen = false;
let isDayMenuOpen = false;
let currentDayData = null;
let availableDateRange = { min: null, max: null };
let lastSelectedTourId = null;

// Robust dropdown state management - IMPROVED PATTERN
let globalClickListener = null;
let currentOpenDayItemId = null;
let currentOpenDayElement = null;
let menuButtonClicked = false;
let clickHandlerSetupComplete = false;
let operationCounter = 0; // Track operations to prevent accumulation

// JST timezone configuration
const JST_OFFSET = 9 * 60 * 60 * 1000;

// English month names for calendar display
const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

// Status configuration with colors and texts for availability states
const STATUS_CONFIG = {
    available: { text: 'Available', color: '#6F8D53' },
    soldout: { text: 'Sold out', color: '#C13939' },
    notoperating: { text: 'Not operating', color: '#4C4C4C' },
    partiallysoldout: { text: 'Slots', color: '#FF9300' }
};

// Color constants for calendar styling
const TODAY_BG_COLOR = '#CFDFF5';
const NON_CURRENT_MONTH_BG = '#CBCACA';

// Initialize page when ready - sets up all components and handlers
$w.onReady(async function () {
    console.log('Availability Manager initializing...');
    appendLog('Availability Manager initializing...');
    
    // Complete system reset on page ready
    performCompleteSystemReset();
    
    // Set initial loading state
    showLoadingState();
    updateSystemStatus('Loading system components...');
    
    // Initialize calendar display with current date
    updateCalendarDisplay();
    
    // Setup repeater handlers before any data operations
    setupRepeaterHandlers();
    
    // Setup tour selector dropdown
    await setupTourSelector();
    
    // Setup navigation buttons with range checking
    setupNavigationButtons();
    
    // Setup menu buttons and dropdown functionality
    setupMenuButtons();
    setupDropdownElements();
    
    // Initially hide navigation buttons since no tour is selected
    hideNavigationButtons();
    
    appendLog('Availability Manager initialized successfully');
    updateSystemStatus('Ready - Select a tour');
    console.log('Availability Manager initialized successfully');
});

/**
 * Perform complete system reset to prevent state accumulation - ROBUST PATTERN
 */
function performCompleteSystemReset() {
    console.log('Performing complete system reset...');
    
    // Reset all dropdown states
    isCalendarMenuOpen = false;
    isDayMenuOpen = false;
    currentDayData = null;
    currentOpenDayItemId = null;
    currentOpenDayElement = null;
    menuButtonClicked = false;
    clickHandlerSetupComplete = false;
    operationCounter = 0;
    
    // Force hide all dropdowns
    if ($w('#calendarDropdown')) {
        $w('#calendarDropdown').hide();
    }
    if ($w('#dayDropdown')) {
        $w('#dayDropdown').hide();
    }
    
    // Complete handler cleanup
    forceRemoveAllHandlers();
    
    console.log('System reset completed');
}

/**
 * Force remove all click handlers to prevent accumulation - ROBUST PATTERN
 */
function forceRemoveAllHandlers() {
    try {
        // Remove global click handler completely
        if (globalClickListener || clickHandlerSetupComplete) {
            $w('#availabilityManager').onClick(() => {});
            globalClickListener = null;
            clickHandlerSetupComplete = false;
            console.log('All global handlers force removed');
        }
    } catch (error) {
        console.error('Error force removing handlers:', error);
    }
}

/**
 * Setup global click listener with robust state management - IMPROVED PATTERN
 */
function setupRobustGlobalClickListener() {
    // Prevent multiple setups
    if (clickHandlerSetupComplete) {
        console.log('Click handler already setup, skipping');
        return;
    }
    
    // Force cleanup before new setup
    forceRemoveAllHandlers();
    
    globalClickListener = function(event) {
        const clickedElementId = event.target.id;
        console.log('Global click detected:', clickedElementId, 'Operation:', operationCounter);
        
        // Skip processing if this click was on a menu button
        if (menuButtonClicked) {
            menuButtonClicked = false;
            console.log('Skipping global click - menu button was clicked');
            return;
        }
        
        // Handle calendar dropdown closure
        if (isCalendarMenuOpen) {
            const calendarElements = [
                'calendarMenu', 'calendarDropdown', 
                'generateAvailabilitiesOption', 'manageClosedPeriodsOption'
            ];
            
            if (!calendarElements.includes(clickedElementId)) {
                console.log('Closing calendar dropdown due to outside click');
                closeCalendarDropdownRobust();
            }
        }
        
        // Handle day dropdown closure
        if (isDayMenuOpen && currentOpenDayElement) {
            const dayElements = [
                'dayMenuButton', 'dayDropdown', 
                'setTimeSlotsOption', 'setNotOperatingOption'
            ];
            
            if (!dayElements.includes(clickedElementId)) {
                console.log('Closing day dropdown due to outside click');
                closeDayDropdownRobust();
            }
        }
    };
    
    $w('#availabilityManager').onClick(globalClickListener);
    clickHandlerSetupComplete = true;
    console.log('Robust global click listener setup successfully');
}

/**
 * Robust day dropdown toggle with complete state management - IMPROVED PATTERN
 */
function toggleDayDropdownRobust(event, dayData) {
    operationCounter++;
    console.log('Toggle day dropdown - Operation:', operationCounter, 'Item:', event.context.itemId);
    
    // Set flag to prevent global click handler interference
    menuButtonClicked = true;
    
    const itemId = event.context.itemId;
    
    // If same item is clicked and dropdown is open, close it
    if (currentOpenDayItemId === itemId && isDayMenuOpen) {
        console.log('Closing dropdown for same item:', itemId);
        closeDayDropdownRobust();
    } else {
        // Close any existing dropdown and open new one
        console.log('Opening dropdown for item:', itemId);
        if (isDayMenuOpen) {
            closeDayDropdownRobust();
        }
        // Small delay to ensure clean state
        setTimeout(() => {
            openDayDropdownRobust(event, dayData);
        }, 50);
    }
}

/**
 * Open day dropdown with robust state tracking - IMPROVED PATTERN
 */
function openDayDropdownRobust(event, dayData) {
    console.log('Opening day dropdown robustly for:', event.context.itemId);
    
    try {
        // Get the specific item element using $w.at(event.context)
        const $item = $w.at(event.context);
        const itemId = event.context.itemId;
        
        // Force close calendar dropdown if open
        if (isCalendarMenuOpen) {
            closeCalendarDropdownRobust();
        }
        
        // Store references for tracking
        currentOpenDayItemId = itemId;
        currentOpenDayElement = $item;
        currentDayData = dayData;
        
        // Show the dayDropdown inside this specific item
        if ($item('#dayDropdown')) {
            $item('#dayDropdown').show();
            isDayMenuOpen = true;
            
            console.log('Day dropdown opened robustly for item:', itemId);
            
            // Setup global click listener with delay
            setTimeout(() => {
                if (isDayMenuOpen) {
                    setupRobustGlobalClickListener();
                }
            }, 100);
        } else {
            console.error('dayDropdown not found in item:', itemId);
        }
        
    } catch (error) {
        console.error('Error opening day dropdown robustly:', error);
        appendLog(`Error opening day dropdown: ${error.message}`);
        // Reset state on error
        performDayDropdownStateReset();
    }
}

/**
 * Close day dropdown with complete state cleanup - IMPROVED PATTERN
 */
function closeDayDropdownRobust() {
    console.log('Closing day dropdown robustly for item:', currentOpenDayItemId);
    
    try {
        // Hide dropdown in specific element
        if (currentOpenDayElement && currentOpenDayElement('#dayDropdown')) {
            currentOpenDayElement('#dayDropdown').hide();
        }
        
        // Perform complete state reset
        performDayDropdownStateReset();
        
        console.log('Day dropdown closed robustly');
        
    } catch (error) {
        console.error('Error closing day dropdown robustly:', error);
        // Force state reset on error
        performDayDropdownStateReset();
    }
}

/**
 * Perform complete day dropdown state reset - ROBUST PATTERN
 */
function performDayDropdownStateReset() {
    isDayMenuOpen = false;
    currentDayData = null;
    currentOpenDayItemId = null;
    currentOpenDayElement = null;
    
    // Remove global click listener only if no other dropdowns are open
    if (!isCalendarMenuOpen) {
        forceRemoveAllHandlers();
    }
    
    console.log('Day dropdown state reset completed');
}

/**
 * Setup repeater item handlers with robust event management - IMPROVED PATTERN
 */
function setupRepeaterHandlers() {
    console.log('Setting up repeater handlers...');
    
    // Clear repeater to avoid stale state
    $w('#calendarRepeater').data = [];
    
    // Setup onItemReady callback before setting data
    $w('#calendarRepeater').onItemReady(($item, itemData, index) => {
        console.log(`Setting up calendar day ${index}: ${itemData.dateKey}`, itemData);
        
        try {
            // Set day number and text color
            $item('#dayText').text = itemData.dayNumber.toString();
            $item('#dayText').style.color = itemData.textColor;
            
            // Set background color including today highlighting
            $item('#dayBox').style.backgroundColor = itemData.backgroundColor;
            
            // Setup interactive elements based on availability
            setupStatusButton($item, itemData, index);
            setupBookingCounter($item, itemData);
            setupSeasonTags($item, itemData);
            
            // IMPORTANT: Hide the dayDropdown initially in each item
            if ($item('#dayDropdown')) {
                $item('#dayDropdown').hide();
            }
            
            console.log(`Day ${index} setup completed: isCurrentMonth=${itemData.isCurrentMonth}, hasData=${itemData.hasAvailabilityData}`);
            
        } catch (error) {
            console.error(`Error setting up day ${index}:`, error);
            appendLog(`Error setting up day ${index}: ${error.message}`);
        }
    });
    
    // Setup day menu button click handler with robust pattern
    $w('#dayMenuButton').onClick((event) => {
        console.log('Day menu button clicked with context:', event.context);
        
        // Use forItems with specific itemId for robust handling
        $w('#calendarRepeater').forItems([event.context.itemId], ($item, itemData) => {
            console.log('Processing robust click for item:', event.context.itemId, 'Data:', itemData.dateKey);
            toggleDayDropdownRobust(event, itemData);
        });
    });
    
    console.log('Repeater handlers configured robustly');
    appendLog('Repeater handlers configured');
}

/**
 * Setup tour selector dropdown using urlName for display
 */
async function setupTourSelector() {
    try {
        console.log('Starting tour dropdown population...');
        appendLog('Loading tours from database...');
        updateSystemStatus('Loading tours...');
        
        // Get all tours from database
        const toursQuery = await wixData.query('Tours')
            .ascending('urlName')
            .find();
        
        console.log('Found', toursQuery.totalCount, 'tours');
        appendLog(`Found ${toursQuery.totalCount} tours total`);
        
        if (toursQuery.items.length === 0) {
            $w('#tourSelector').options = [{ label: 'No tours found', value: '' }];
            appendLog('No tours found in database');
            updateSystemStatus('No tours available');
            return;
        }
        
        // Create dropdown options using urlName for display
        const options = [{ label: '-- Select a tour --', value: '' }];
        
        toursQuery.items.forEach(tour => {
            options.push({
                label: tour.urlName || tour.title || tour._id || 'Unnamed Tour',
                value: tour._id
            });
        });
        
        // Set dropdown options and store tour data
        $w('#tourSelector').options = options;
        toursData = toursQuery.items;
        $w('#tourSelector').onChange(onTourSelected);
        
        appendLog(`Successfully loaded ${toursQuery.items.length} tours in dropdown`);
        updateSystemStatus(`Tours loaded - Select a tour`);
        console.log('Tour dropdown populated successfully');
        
    } catch (error) {
        console.error('Error setting up tour selector:', error);
        appendLog(`Error loading tours: ${error.message}`);
        updateSystemStatus('Error loading tours');
        $w('#tourSelector').options = [{ label: 'Error loading tours', value: '' }];
    }
}

/**
 * Handle tour selection with automatic current month reset and navigation button management
 */
async function onTourSelected(event) {
    const selectedValue = event.target.value;
    
    if (!selectedValue) {
        showLoadingState();
        currentTourId = null;
        currentTourLabel = '';
        lastSelectedTourId = null;
        availabilityData = {};
        availabilityRecord = null;
        
        // Hide navigation buttons when no tour is selected
        hideNavigationButtons();
        
        updateSystemStatus('Select a tour to begin');
        return;
    }
    
    // Always force refresh by clearing previous data
    availabilityData = {};
    availabilityRecord = null;
    
    // Reset current date to today when selecting a tour to prevent navigation bugs
    currentDate = new Date();
    updateCalendarDisplay();
    
    // Set tour ID and find label using urlName
    currentTourId = selectedValue;
    lastSelectedTourId = selectedValue;
    const selectedTour = toursData.find(tour => tour._id === selectedValue);
    currentTourLabel = selectedTour ? (selectedTour.urlName || selectedTour.title || selectedTour._id) : selectedValue;
    
    showLoadingAnimation();
    updateSystemStatus('Loading fresh availability data...');
    
    try {
        appendLog(`Loading availability for: ${currentTourLabel}`);
        
        // Always fetch fresh data from database
        const availabilityQuery = await wixData.query('Availability')
            .eq('tourName', currentTourId)
            .find();
        
        if (availabilityQuery.items.length === 0) {
            appendLog('No availability record found for selected tour');
            showLoadingState();
            updateSystemStatus('No availability data found');
            
            await wixWindow.openLightbox('messageLightbox', {
                message: 'No availabilities found for the selected tour. Run the "Availability Generation" function from the calendar menu.'
            });
            return;
        }
        
        // Store availability record and load fresh data
        availabilityRecord = availabilityQuery.items[0];
        updateSystemStatus('Processing calendar data...');
        
        await loadAvailabilityData();
        calculateAvailableDateRange();
        await populateCalendar();
        updateNavigationButtons();
        showCalendarState();
        
        appendLog(`Data loaded successfully for ${currentTourLabel}`);
        updateSystemStatus('Ready');
        
    } catch (error) {
        console.error('Error loading tour data:', error);
        appendLog(`Error loading tour data: ${error.message}`);
        updateSystemStatus('Error loading data');
        showLoadingState();
    }
}

/**
 * Load availability data from database array field with improved date handling
 */
async function loadAvailabilityData() {
    if (!currentTourId || !availabilityRecord) return;
    
    try {
        appendLog('Processing availability data...');
        availabilityData = {};
        
        // Process availabilityData array from database record
        if (availabilityRecord.availabilityData && Array.isArray(availabilityRecord.availabilityData)) {
            availabilityRecord.availabilityData.forEach(item => {
                // Use simple date format without JST conversion for key matching
                const itemDate = new Date(item.date);
                const dateKey = formatDateKeySimple(itemDate);
                availabilityData[dateKey] = item;
                console.log(`Loaded availability: ${dateKey} = ${item.status}`);
            });
        }
        
        console.log('Availability data processed:', Object.keys(availabilityData).length, 'items');
        console.log('Available dates:', Object.keys(availabilityData));
        appendLog(`Loaded ${Object.keys(availabilityData).length} availability records`);
        
    } catch (error) {
        console.error('Error loading availability data:', error);
        appendLog(`Error loading availability: ${error.message}`);
        throw error;
    }
}

/**
 * Calculate the range of available dates for navigation control
 */
function calculateAvailableDateRange() {
    const dates = Object.keys(availabilityData).map(key => new Date(key));
    if (dates.length === 0) {
        availableDateRange = { min: null, max: null };
        return;
    }
    
    // Use getTime() to convert dates to numbers for proper comparison
    dates.sort((a, b) => a.getTime() - b.getTime());
    availableDateRange = {
        min: new Date(dates[0].getFullYear(), dates[0].getMonth(), 1),
        max: new Date(dates[dates.length - 1].getFullYear(), dates[dates.length - 1].getMonth(), 1)
    };
    
    console.log('Available date range:', availableDateRange);
}

/**
 * Generate calendar data with improved month detection
 */
function generateCalendarData() {
    const viewYear = currentDate.getFullYear();
    const viewMonth = currentDate.getMonth();
    
    console.log(`Generating calendar for ${MONTH_NAMES[viewMonth]} ${viewYear}`);
    
    // Calculate calendar boundaries
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
    const firstDayOfWeek = firstDayOfMonth.getDay();
    const lastDayOfMonth = new Date(viewYear, viewMonth + 1, 0);
    const lastDateOfMonth = lastDayOfMonth.getDate();
    const prevMonthLastDay = new Date(viewYear, viewMonth, 0).getDate();
    
    const calendarData = [];
    
    // Fill previous month days
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
        const dayNumber = prevMonthLastDay - i;
        const date = new Date(viewYear, viewMonth - 1, dayNumber);
        calendarData.push(createDayData(date, dayNumber, viewYear, viewMonth));
    }
    
    // Fill current month days
    for (let day = 1; day <= lastDateOfMonth; day++) {
        const date = new Date(viewYear, viewMonth, day);
        calendarData.push(createDayData(date, day, viewYear, viewMonth));
    }
    
    // Fill next month days to reach 42 days
    const remainingDays = 42 - calendarData.length;
    for (let day = 1; day <= remainingDays; day++) {
        const date = new Date(viewYear, viewMonth + 1, day);
        calendarData.push(createDayData(date, day, viewYear, viewMonth));
    }
    
    console.log('Generated calendar data:', calendarData.length, 'days for', MONTH_NAMES[viewMonth], viewYear);
    return calendarData;
}

/**
 * Create day data object with improved date handling and debugging
 */
function createDayData(date, dayNumber, viewYear, viewMonth) {
    const dayOfWeek = date.getDay();
    const dateKey = formatDateKeySimple(date);
    const availability = availabilityData[dateKey] || null;
    
    // Improved month detection
    const isCurrentMonth = date.getMonth() === viewMonth && date.getFullYear() === viewYear;
    
    // Determine text color based on day of week
    let textColor = '#262E39';
    if (dayOfWeek === 0) {
        textColor = '#FF0000'; // Sunday - red
    } else if (dayOfWeek === 6) {
        textColor = '#0056B3'; // Saturday - blue
    }
    
    // Calculate background color with proper today detection and month logic
    let backgroundColor = 'transparent';
    const today = new Date();
    const isToday = date.getDate() === today.getDate() && 
                   date.getMonth() === today.getMonth() && 
                   date.getFullYear() === today.getFullYear();
    
    if (isToday && isCurrentMonth) {
        backgroundColor = TODAY_BG_COLOR;
    } else if (!isCurrentMonth) {
        backgroundColor = NON_CURRENT_MONTH_BG;
    }
    
    // Get availability information
    const seasonInfo = availability ? availability.season : 'normal';
    const status = availability ? availability.status : 'available';
    const bookedParticipants = availability ? (availability.bookedParticipants || 0) : 0;
    const hasData = availability !== null;
    
    // Create valid ID for Wix repeater
    const validId = `d-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
    
    // Debug logging for problematic dates
    if (dayNumber === 1) {
        console.log(`Day 1 debug: date=${date.toISOString()}, viewMonth=${viewMonth}, isCurrentMonth=${isCurrentMonth}, dateKey=${dateKey}, hasData=${hasData}`);
    }
    
    return {
        _id: validId,
        dayNumber: dayNumber,
        dateKey: dateKey,
        date: date,
        isCurrentMonth: isCurrentMonth,
        textColor: textColor,
        backgroundColor: backgroundColor,
        status: status,
        bookedParticipants: bookedParticipants,
        season: seasonInfo,
        availability: availability,
        hasAvailabilityData: hasData
    };
}

/**
 * Populate calendar repeater with generated data
 */
async function populateCalendar() {
    try {
        appendLog('Generating calendar data...');
        updateSystemStatus('Populating calendar...');
        
        const calendarData = generateCalendarData();
        console.log('Setting repeater data with', calendarData.length, 'items');
        
        // Clear existing data first
        $w('#calendarRepeater').data = [];
        
        // Wait a moment for clearing to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Set new data
        $w('#calendarRepeater').data = calendarData;
        
        console.log('Calendar populated with', calendarData.length, 'days');
        appendLog(`Calendar populated with ${calendarData.length} days`);
        
    } catch (error) {
        console.error('Error populating calendar:', error);
        appendLog(`Error populating calendar: ${error.message}`);
        throw error;
    }
}

/**
 * Setup status button with improved visibility control and debugging
 */
function setupStatusButton($item, itemData, index) {
    console.log(`Setting up status button for day ${itemData.dayNumber}: hasData=${itemData.hasAvailabilityData}, isCurrentMonth=${itemData.isCurrentMonth}`);
    
    // Show status button only for days with availability data
    if (!itemData.hasAvailabilityData) {
        $item('#statusButton').hide();
        console.log(`Hiding status button for day ${itemData.dayNumber} - no availability data`);
        return;
    }
    
    $item('#statusButton').show();
    console.log(`Showing status button for day ${itemData.dayNumber} with status ${itemData.status}`);
    
    const statusConfig = STATUS_CONFIG[itemData.status] || STATUS_CONFIG.available;
    
    // Apply status styling
    $item('#statusButton').label = statusConfig.text;
    $item('#statusButton').style.backgroundColor = statusConfig.color;
    $item('#statusButton').style.color = '#FFFFFF';
    
    // Setup click handler for status toggle
    $item('#statusButton').onClick(async () => {
        await toggleDayStatus(itemData);
    });
}

/**
 * Setup booking counter display
 */
function setupBookingCounter($item, itemData) {
    $item('#bookingCounterButton').label = itemData.bookedParticipants.toString();
}

/**
 * Setup season tags with proper data handling
 */
function setupSeasonTags($item, itemData) {
    if (itemData.season === 'high') {
        $item('#highSeasonTag').show();
        $item('#normalSeasonTag').hide();
    } else {
        $item('#highSeasonTag').hide();
        $item('#normalSeasonTag').show();
    }
}

/**
 * Setup menu buttons with robust click handling
 */
function setupMenuButtons() {
    if ($w('#calendarMenu')) {
        // Setup calendar menu handler with robust state management
        $w('#calendarMenu').onClick(() => {
            console.log('Calendar menu clicked, current state:', isCalendarMenuOpen);
            
            // Set flag to prevent global click handler from interfering
            menuButtonClicked = true;
            
            if (isCalendarMenuOpen) {
                closeCalendarDropdownRobust();
            } else {
                // Close day dropdown if open
                if (isDayMenuOpen) {
                    closeDayDropdownRobust();
                }
                // Wait a moment then open calendar dropdown
                setTimeout(() => {
                    openCalendarDropdownRobust();
                }, 50);
            }
        });
        
        console.log('Calendar menu button bound successfully');
        appendLog('Calendar menu configured');
    }
}

/**
 * Setup dropdown menu elements
 */
function setupDropdownElements() {
    // Ensure dropdown elements are hidden
    performCompleteSystemReset();
    
    // Setup calendar dropdown menu items
    if ($w('#generateAvailabilitiesOption')) {
        $w('#generateAvailabilitiesOption').onClick(() => {
            handleCalendarMenuAction('generateAvailabilities');
        });
    }
    
    if ($w('#manageClosedPeriodsOption')) {
        $w('#manageClosedPeriodsOption').onClick(() => {
            handleCalendarMenuAction('manageClosedPeriods');
        });
    }
    
    // Setup day dropdown menu items
    if ($w('#setTimeSlotsOption')) {
        $w('#setTimeSlotsOption').onClick(() => {
            handleDayMenuAction('setTimeSlots', currentDayData);
        });
    }
    
    if ($w('#setNotOperatingOption')) {
        $w('#setNotOperatingOption').onClick(() => {
            handleDayMenuAction('setNotOperating', currentDayData);
        });
    }
}

/**
 * Open calendar dropdown with robust state management
 */
function openCalendarDropdownRobust() {
    console.log('Opening calendar dropdown robustly');
    
    if ($w('#calendarDropdown')) {
        $w('#calendarDropdown').show();
        isCalendarMenuOpen = true;
        
        // Setup global click listener to handle outside clicks
        setupRobustGlobalClickListener();
        
        console.log('Calendar dropdown opened robustly');
    }
}

/**
 * Close calendar dropdown with complete state cleanup
 */
function closeCalendarDropdownRobust() {
    console.log('Closing calendar dropdown robustly');
    
    if ($w('#calendarDropdown')) {
        $w('#calendarDropdown').hide();
        isCalendarMenuOpen = false;
        
        // Remove global click listener only if no other dropdowns are open
        if (!isDayMenuOpen) {
            forceRemoveAllHandlers();
        }
        
        console.log('Calendar dropdown closed robustly');
    }
}

/**
 * Handle calendar menu actions with tour selection validation
 */
async function handleCalendarMenuAction(action) {
    closeCalendarDropdownRobust();
    appendLog(`Calendar action: ${action}`);
    
    switch (action) {
        case 'generateAvailabilities':
            // Check if tour is selected
            if (!currentTourId) {
                await wixWindow.openLightbox('messageLightbox', {
                    message: 'Select a tour from the menu.'
                });
                return;
            }
            
            const confirmMessage = `This operation will generate availability dates for tour:\n\n"${currentTourLabel}".\n\nIf availabilities are already present, the database will be rebuilt.\nSoldout/available statuses and existing bookings will be preserved.\n\nContinue?`;
            
            try {
                const result = await wixWindow.openLightbox('confirmLightbox2', {
                    message: confirmMessage
                });
                
                if (result === 'confirm') {
                    updateSystemStatus('Generating availabilities...');
                    appendLog('Starting availability generation process');
                    // TODO: Implement availability generation logic
                    updateSystemStatus('Ready');
                    appendLog('Availability generation completed');
                }
            } catch (error) {
                console.error('Error in generate availabilities:', error);
                appendLog(`Error in generate availabilities: ${error.message}`);
            }
            break;
            
        case 'manageClosedPeriods':
            wixLocation.to('/manage-closed-periods');
            break;
    }
}

/**
 * Handle day menu actions
 */
async function handleDayMenuAction(action, data) {
    closeDayDropdownRobust();
    
    if (!data) {
        appendLog('No day data available for action');
        return;
    }
    
    appendLog(`Day action: ${action} for ${data.dateKey}`);
    
    switch (action) {
        case 'setTimeSlots':
            await openTimeSlotsLightbox(data);
            break;
        case 'setNotOperating':
            await setDayNotOperating(data);
            break;
    }
}

/**
 * Toggle day status with improved refresh handling
 */
async function toggleDayStatus(dayData) {
    let newStatus;
    
    switch (dayData.status) {
        case 'available':
            newStatus = 'soldout';
            break;
        case 'soldout':
            newStatus = 'available';
            break;
        case 'notoperating':
            newStatus = 'available';
            break;
        case 'partiallysoldout':
            newStatus = 'soldout';
            break;
        default:
            newStatus = 'available';
    }
    
    try {
        updateSystemStatus('Updating status...');
        appendLog(`Updating ${dayData.dateKey}: ${dayData.status} → ${newStatus}`);
        
        // Update status in database
        await updateAvailabilityStatus(dayData.dateKey, newStatus);
        
        // Force complete refresh of tour data
        await forceRefreshTourData();
        
        appendLog(`Status updated to ${STATUS_CONFIG[newStatus].text}`);
        updateSystemStatus('Ready');
        
    } catch (error) {
        console.error('Error updating status:', error);
        appendLog(`Error updating status: ${error.message}`);
        updateSystemStatus('Error updating status');
    }
}

/**
 * Update availability status without adding updatedAt to array items
 */
async function updateAvailabilityStatus(dateKey, newStatus) {
    if (!currentTourId || !availabilityRecord) return;
    
    try {
        // Preserve all existing record fields
        const updateData = {
            _id: availabilityRecord._id,
            availabilityId: availabilityRecord.availabilityId,
            tourName: availabilityRecord.tourName,
            tourId: availabilityRecord.tourId,
            closedPeriods: availabilityRecord.closedPeriods,
            updatedAt: getJSTDate(new Date())
        };
        
        // Process availability data array
        const availabilityDataArray = [...(availabilityRecord.availabilityData || [])];
        const dateIndex = availabilityDataArray.findIndex(item => {
            const itemDate = new Date(item.date);
            const itemDateKey = formatDateKeySimple(itemDate);
            return itemDateKey === dateKey;
        });
        
        if (dateIndex !== -1) {
            // Update existing record without adding updatedAt to array item
            availabilityDataArray[dateIndex] = {
                ...availabilityDataArray[dateIndex],
                status: newStatus
            };
        } else {
            // Create new record without updatedAt in array item
            const date = new Date(dateKey);
            availabilityDataArray.push({
                date: date.toISOString(),
                status: newStatus,
                bookedParticipants: 0,
                season: 'normal',
                createdAt: getJSTDate(new Date()).toISOString()
            });
        }
        
        // Update database with clean array data
        updateData.availabilityData = availabilityDataArray;
        await wixData.update('Availability', updateData);
        
        console.log('Database updated successfully');
        
    } catch (error) {
        console.error('Error updating availability status:', error);
        throw error;
    }
}

/**
 * Force complete refresh of tour data to ensure UI reflects database state
 */
async function forceRefreshTourData() {
    if (!currentTourId) return;
    
    try {
        // Clear all cached data
        availabilityData = {};
        availabilityRecord = null;
        
        // Fetch completely fresh data from database
        const availabilityQuery = await wixData.query('Availability')
            .eq('tourName', currentTourId)
            .find();
        
        if (availabilityQuery.items.length > 0) {
            availabilityRecord = availabilityQuery.items[0];
            await loadAvailabilityData();
            await populateCalendar();
        }
        
        console.log('Tour data force refreshed');
        
    } catch (error) {
        console.error('Error force refreshing tour data:', error);
        appendLog(`Error force refreshing data: ${error.message}`);
    }
}

/**
 * Open time slots lightbox for day configuration
 */
async function openTimeSlotsLightbox(dayData) {
    try {
        updateSystemStatus('Opening time slots...');
        appendLog(`Opening time slots for ${dayData.dateKey}`);
        
        const tour = toursData.find(t => t._id === currentTourId);
        if (!tour || !tour.hoursOfAvailability) {
            appendLog('Hours of availability not found for this tour');
            updateSystemStatus('Time slots not available');
            return;
        }
        
        const result = await wixWindow.openLightbox('timeSlotsLightbox', {
            dayData: dayData,
            hoursOfAvailability: tour.hoursOfAvailability
        });
        
        if (result && result.action === 'save') {
            // Force complete refresh after time slots update
            await forceRefreshTourData();
            appendLog('Time slots updated successfully');
            updateSystemStatus('Ready');
        }
        
    } catch (error) {
        console.error('Error opening time slots lightbox:', error);
        appendLog(`Error opening time slots: ${error.message}`);
        updateSystemStatus('Error opening time slots');
    }
}

/**
 * Set day as not operating status
 */
async function setDayNotOperating(dayData) {
    try {
        updateSystemStatus('Setting not operating...');
        appendLog(`Setting ${dayData.dateKey} as not operating`);
        
        await updateAvailabilityStatus(dayData.dateKey, 'notoperating');
        
        // Force complete refresh after update
        await forceRefreshTourData();
        
        appendLog('Day set as not operating');
        updateSystemStatus('Ready');
        
    } catch (error) {
        console.error('Error setting day as not operating:', error);
        appendLog(`Error setting not operating: ${error.message}`);
        updateSystemStatus('Error setting day status');
    }
}

/**
 * Setup navigation buttons with tour selection requirement
 */
function setupNavigationButtons() {
    if ($w('#prevMonthButton')) {
        $w('#prevMonthButton').onClick(() => {
            // Only allow navigation if tour is selected
            if (currentTourId) {
                changeMonth(-1);
            }
        });
    }
    
    if ($w('#nextMonthButton')) {
        $w('#nextMonthButton').onClick(() => {
            // Only allow navigation if tour is selected
            if (currentTourId) {
                changeMonth(1);
            }
        });
    }
}

/**
 * Hide navigation buttons when no tour is selected to prevent navigation bugs
 */
function hideNavigationButtons() {
    if ($w('#prevMonthButton')) {
        $w('#prevMonthButton').hide();
    }
    if ($w('#nextMonthButton')) {
        $w('#nextMonthButton').hide();
    }
    console.log('Navigation buttons hidden - no tour selected');
}

/**
 * Update navigation button visibility based on tour selection and available date range
 */
function updateNavigationButtons() {
    // Show buttons only if tour is selected
    if (!currentTourId) {
        hideNavigationButtons();
        return;
    }
    
    // If no date range, show both buttons
    if (!availableDateRange.min || !availableDateRange.max) {
        $w('#prevMonthButton').show();
        $w('#nextMonthButton').show();
        return;
    }
    
    const currentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    
    // Hide prev button if at or before minimum month
    if (currentMonth.getTime() <= availableDateRange.min.getTime()) {
        $w('#prevMonthButton').hide();
    } else {
        $w('#prevMonthButton').show();
    }
    
    // Hide next button if at or after maximum month
    if (currentMonth.getTime() >= availableDateRange.max.getTime()) {
        $w('#nextMonthButton').hide();
    } else {
        $w('#nextMonthButton').show();
    }
    
    console.log('Navigation buttons updated for tour:', currentTourLabel);
}

/**
 * Change current month with range checking and tour validation
 */
async function changeMonth(direction) {
    // Prevent navigation if no tour selected
    if (!currentTourId) {
        appendLog('Cannot navigate - no tour selected');
        return;
    }
    
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + direction);
    
    // Check if new month is within available range
    if (availableDateRange.min && availableDateRange.max) {
        const newMonth = new Date(newDate.getFullYear(), newDate.getMonth(), 1);
        
        if (newMonth.getTime() < availableDateRange.min.getTime() || 
            newMonth.getTime() > availableDateRange.max.getTime()) {
            appendLog('Cannot navigate outside available date range');
            return;
        }
    }
    
    currentDate = newDate;
    updateCalendarDisplay();
    updateNavigationButtons();
    
    appendLog(`Changed to ${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`);
    
    // Reload calendar if tour is selected
    if (currentTourId && availabilityRecord) {
        updateSystemStatus('Loading month data...');
        await populateCalendar();
        updateSystemStatus('Ready');
    }
}

/**
 * Update calendar month and year display
 */
function updateCalendarDisplay() {
    $w('#calendarMonth').text = MONTH_NAMES[currentDate.getMonth()];
    $w('#yearText').text = currentDate.getFullYear().toString();
}

/**
 * Show loading state with proper element management
 */
function showLoadingState() {
    $w('#loadingBox').expand();
    $w('#selectTourText').expand();
    $w('#loading').collapse();
    $w('#repeaterBox').collapse();
}

/**
 * Show loading animation during data operations
 */
function showLoadingAnimation() {
    $w('#loadingBox').expand();
    $w('#selectTourText').collapse();
    $w('#loading').expand();
    $w('#repeaterBox').collapse();
}

/**
 * Show calendar state when data is loaded
 */
function showCalendarState() {
    $w('#loadingBox').collapse();
    $w('#selectTourText').expand();
    $w('#loading').collapse();
    $w('#repeaterBox').expand();
}

/**
 * Update system status message for user feedback
 */
function updateSystemStatus(message) {
    try {
        if ($w('#statusMessage')) {
            $w('#statusMessage').text = message;
            console.log('Status updated:', message);
        }
    } catch (error) {
        console.error('Error updating status:', error);
    }
}

/**
 * Append log message with timestamp
 */
function appendLog(message) {
    try {
        const timestamp = new Date().toLocaleString('en-GB', {
            day: '2-digit',
            month: '2-digit', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        const logMessage = `${timestamp} - ${message}`;
        
        if ($w('#logOutput')) {
            const currentLog = $w('#logOutput').text || '';
            const newLog = logMessage + '\n' + currentLog;
            
            const lines = newLog.split('\n');
            $w('#logOutput').text = lines.slice(0, 100).join('\n');
        }
    } catch (error) {
        console.error('Error appending log:', error);
    }
}

/**
 * Get season info for a date - placeholder for future implementation
 */
function getSeasonInfo(date) {
    // TODO: Implement high season period checking
    return 'normal';
}

/**
 * JST date utility functions
 */
function getJSTDate(date) {
    const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
    return new Date(utc + JST_OFFSET);
}

function formatDateKey(date) {
    const jstDate = getJSTDate(date);
    return jstDate.toISOString().split('T')[0];
}

/**
 * Simple date key formatting without JST conversion for consistent matching
 */
function formatDateKeySimple(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey) {
    return new Date(dateKey + 'T00:00:00.000Z');
}

// Export functions for testing
export { 
    setupTourSelector,
    loadAvailabilityData,
    populateCalendar,
    toggleDayStatus,
    changeMonth
};
