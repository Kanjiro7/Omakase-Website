// Import required Wix APIs for database operations and UI management
import wixData from 'wix-data';
import wixWindow from 'wix-window';
import wixLocation from 'wix-location-frontend';
import { generateAvailabilityForTour, createInitialAvailability } from 'backend/availability/availabilityCore.web.js';

// Color variables centralized for easy management and consistency
const COLORS = {
    // Text colors for days of week
    TEXT_NORMAL: '#262E39',        // Normal weekdays text color
    TEXT_SUNDAY: '#C13939',        // Sunday text color (red)
    TEXT_SATURDAY: '#405FB0',      // Saturday text color (blue)
    
    // Background colors for calendar days
    BG_CURRENT_MONTH: '#FFFFFF',   // Current month days background
    BG_OTHER_MONTH: '#B7BFC5',     // Non-current month days background
    
    // Border colors (4px borders, coordinated with backgrounds)
    BORDER_CURRENT_MONTH: '#FFFFFF',  // Normal days border (matches background)
    BORDER_OTHER_MONTH: '#B7BFC5',    // Non-current month days border (matches background)
    BORDER_TODAY: '#567FCB',           // Current day border highlight (blue)
    
    // Status colors for availability states
    STATUS_AVAILABLE: '#6F8D53',      // Available status color (green)
    STATUS_SOLDOUT: '#C13939',        // Sold out status color (red)
    STATUS_NOT_OPERATING: '#4C4C4C',  // Not operating status color (gray)
    STATUS_PARTIAL: '#FF9300'         // Partial availability color (orange)
};

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
let availableMonths = []; // Store available months from data
let isMonthDropdownPopulated = false; // Track if dropdown has been populated
let isInitializationComplete = false; // Track if all initialization is complete

// Robust dropdown state management - improved pattern to prevent flash effects
let globalClickListener = null;
let currentOpenDayItemId = null;
let currentOpenDayElement = null;
let menuButtonClicked = false;
let clickHandlerSetupComplete = false;
let operationCounter = 0; // Track operations to prevent accumulation

// JST timezone configuration (Japan Standard Time - 9 hours ahead of UTC)
const JST_OFFSET = 9 * 60 * 60 * 1000;

// English month names for calendar display
const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

// Status configuration with centralized colors and texts for availability states
const STATUS_CONFIG = {
    available: { text: 'Available', color: COLORS.STATUS_AVAILABLE },
    soldout: { text: 'Sold out', color: COLORS.STATUS_SOLDOUT },
    notoperating: { text: 'Not operating', color: COLORS.STATUS_NOT_OPERATING },
    partiallysoldout: { text: 'Slots', color: COLORS.STATUS_PARTIAL }
};

// Initialize page when ready - sets up all components and handlers with proper loading states
$w.onReady(async function () {
    console.log('Availability Manager initializing...');
    appendLog('Availability Manager initializing...');
    
    // Show loading state immediately while components are being set up
    showLoadingState();
    updateSystemStatus('Loading system...');
    
    // Complete system reset on page ready to prevent state issues
    performCompleteSystemReset();
    
    // Initialize calendar display with current date
    updateCalendarDisplayToCurrentDate();
    
    // Setup calendar month dropdown functionality 
    setupCalendarMonthDropdown();
    
    // Setup repeater handlers before any data operations - critical for proper initialization
    setupRepeaterHandlers();
    
    // Setup navigation buttons with range checking for tour-based navigation
    setupNavigationButtons();
    
    // Setup menu buttons and dropdown functionality with robust state management
    setupMenuButtons();
    setupDropdownElements();
    
    // Initially hide navigation buttons since no tour is selected (prevents navigation bugs)
    hideNavigationButtons();
    
    // Load tours data and wait for completion before showing ready state
    await setupTourSelector();
    
    // Mark initialization as complete after everything is properly loaded
    isInitializationComplete = true;
    
    appendLog('Availability Manager initialized successfully');
    console.log('Availability Manager initialized successfully');
});

/**
 * Setup calendar month dropdown functionality
 * Handles dynamic population and selection with consistent Month Year format
 */
function setupCalendarMonthDropdown() {
    console.log('Setting up calendar month dropdown...');
    
    // Setup click handler to populate dropdown on first click
    $w('#calendarMonth').onClick(() => {
        if (!isMonthDropdownPopulated && currentTourId && availabilityData) {
            populateMonthDropdown();
        }
    });
    
    // Setup change handler to handle month selection
    $w('#calendarMonth').onChange((event) => {
        handleMonthDropdownChange(event);
    });
    
    console.log('Calendar month dropdown configured');
}

/**
 * Populate month dropdown with available months - SIMPLIFIED VERSION
 * Creates options in consistent "Month Year" format for both display and options
 */
function populateMonthDropdown() {
    try {
        console.log('Populating month dropdown with available months...');
        
        // Extract unique months from availability data
        const uniqueMonths = new Set();
        
        // Process all dates in availability data
        Object.keys(availabilityData).forEach(dateKey => {
            const date = new Date(dateKey);
            const year = date.getFullYear();
            const month = date.getMonth();
            const monthYear = `${year}-${String(month).padStart(2, '0')}`;
            uniqueMonths.add(monthYear);
        });
        
        // Convert to sorted array and create dropdown options
        availableMonths = Array.from(uniqueMonths).sort().map(monthYear => {
            const [year, month] = monthYear.split('-');
            const monthName = MONTH_NAMES[parseInt(month)];
            return {
                label: `${monthName} ${year}`,  // Consistent format: "July 2025"
                value: monthYear,               // Value format: "2025-06"
                monthName: monthName,           // Just month name: "July"
                year: parseInt(year),           // Year as number: 2025
                monthIndex: parseInt(month)     // Month index: 6 for July
            };
        });
        
        // Set dropdown options with consistent Month Year format
        $w('#calendarMonth').options = availableMonths.map(month => ({
            label: month.label,  // Always "Month Year" format
            value: month.value
        }));
        
        // Set current month as selected
        const currentMonthValue = `${currentDate.getFullYear()}-${String(currentDate.getMonth()).padStart(2, '0')}`;
        const currentMonth = availableMonths.find(month => month.value === currentMonthValue);
        
        if (currentMonth) {
            $w('#calendarMonth').value = currentMonth.value;
            // No text manipulation - let the dropdown show the full label naturally
        }
        
        isMonthDropdownPopulated = true;
        console.log('Month dropdown populated with', availableMonths.length, 'months');
        appendLog(`Month dropdown populated with ${availableMonths.length} available months`);
        
    } catch (error) {
        console.error('Error populating month dropdown:', error);
        appendLog(`Error populating month dropdown: ${error.message}`);
    }
}

/**
 * Handle month dropdown selection change
 * Updates calendar view when user selects a month
 */
function handleMonthDropdownChange(event) {
    try {
        const selectedValue = event.target.value;
        console.log('Month dropdown changed to:', selectedValue);
        
        // Find selected month data
        const selectedMonth = availableMonths.find(month => month.value === selectedValue);
        
        if (selectedMonth) {
            // Update current date to selected month
            currentDate = new Date(selectedMonth.year, selectedMonth.monthIndex, 1);
            
            // Update year display
            $w('#yearText').text = selectedMonth.year.toString();
            
            // Update navigation buttons for new month
            updateNavigationButtons();
            
            // Reload calendar for new month
            if (currentTourId && availabilityRecord) {
                updateSystemStatus('Loading month data...');
                populateCalendar().then(() => {
                    updateSystemStatus('Ready');
                });
            }
            
            appendLog(`Changed to ${selectedMonth.monthName} ${selectedMonth.year}`);
        }
        
    } catch (error) {
        console.error('Error handling month dropdown change:', error);
        appendLog(`Error changing month: ${error.message}`);
    }
}

/**
 * Reset month dropdown when tour changes
 * Clears dropdown state when switching tours
 */
function resetMonthDropdown() {
    isMonthDropdownPopulated = false;
    availableMonths = [];
    
    // Reset dropdown to current month display (no tour selected state)
    updateCalendarDisplayToCurrentDate();
    
    console.log('Month dropdown reset for new tour');
}

/**
 * Update calendar display to show current date - ENHANCED VERSION
 * Shows current month and year consistently formatted
 */
function updateCalendarDisplayToCurrentDate() {
    const now = new Date();
    const currentMonthName = MONTH_NAMES[now.getMonth()];
    const currentYear = now.getFullYear();
    
    // Update year text to current year
    $w('#yearText').text = currentYear.toString();
    
    // Set month dropdown to show current month with year
    $w('#calendarMonth').options = [{ 
        label: `${currentMonthName} ${currentYear}`,  // Consistent format: "July 2025"
        value: `${currentYear}-${String(now.getMonth()).padStart(2, '0')}` 
    }];
    $w('#calendarMonth').value = `${currentYear}-${String(now.getMonth()).padStart(2, '0')}`;
    
    console.log(`Calendar display set to current date: ${currentMonthName} ${currentYear}`);
}

/**
 * Perform complete system reset to prevent state accumulation
 * Resets all global variables and UI states to clean initial state
 */
function performCompleteSystemReset() {
    console.log('Performing complete system reset...');
    
    // Reset all dropdown states to prevent conflicts
    isCalendarMenuOpen = false;
    isDayMenuOpen = false;
    currentDayData = null;
    currentOpenDayItemId = null;
    currentOpenDayElement = null;
    menuButtonClicked = false;
    clickHandlerSetupComplete = false;
    operationCounter = 0;
    isInitializationComplete = false;
    
    // Reset month dropdown state
    resetMonthDropdown();
    
    // Force hide all dropdowns to ensure clean UI state
    if ($w('#calendarDropdown')) {
        $w('#calendarDropdown').hide();
    }
    if ($w('#dayDropdown')) {
        $w('#dayDropdown').hide();
    }
    
    // Complete handler cleanup to prevent event accumulation
    forceRemoveAllHandlers();
    
    console.log('System reset completed');
}

/**
 * Force remove all click handlers to prevent accumulation
 * Cleans up all global event handlers to prevent memory leaks and conflicts
 */
function forceRemoveAllHandlers() {
    try {
        // Remove global click handler completely to prevent accumulation
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
 * Setup global click listener with robust state management
 * Handles outside clicks for dropdown closure without conflicts
 */
function setupRobustGlobalClickListener() {
    // Prevent multiple setups to avoid handler accumulation
    if (clickHandlerSetupComplete) {
        console.log('Click handler already setup, skipping');
        return;
    }
    
    // Force cleanup before new setup to ensure clean state
    forceRemoveAllHandlers();
    
    globalClickListener = function(event) {
        const clickedElementId = event.target.id;
        console.log('Global click detected:', clickedElementId, 'Operation:', operationCounter);
        
        // Skip processing if this click was on a menu button to prevent conflicts
        if (menuButtonClicked) {
            menuButtonClicked = false;
            console.log('Skipping global click - menu button was clicked');
            return;
        }
        
        // Handle calendar dropdown closure on outside clicks
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
        
        // Handle day dropdown closure on outside clicks
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
 * Robust day dropdown toggle with complete state management
 * Manages day-specific dropdown menus with proper state tracking
 */
function toggleDayDropdownRobust(event, dayData) {
    operationCounter++;
    console.log('Toggle day dropdown - Operation:', operationCounter, 'Item:', event.context.itemId);
    
    // Set flag to prevent global click handler interference
    menuButtonClicked = true;
    
    const itemId = event.context.itemId;
    
    // If same item is clicked and dropdown is open, close it (toggle behavior)
    if (currentOpenDayItemId === itemId && isDayMenuOpen) {
        console.log('Closing dropdown for same item:', itemId);
        closeDayDropdownRobust();
    } else {
        // Close any existing dropdown and open new one
        console.log('Opening dropdown for item:', itemId);
        if (isDayMenuOpen) {
            closeDayDropdownRobust();
        }
        // Small delay to ensure clean state transition
        setTimeout(() => {
            openDayDropdownRobust(event, dayData);
        }, 50);
    }
}

/**
 * Open day dropdown with robust state tracking
 * Opens day-specific dropdown menu with proper element targeting
 */
function openDayDropdownRobust(event, dayData) {
    console.log('Opening day dropdown robustly for:', event.context.itemId);
    
    try {
        // Get the specific item element using $w.at(event.context)
        const $item = $w.at(event.context);
        const itemId = event.context.itemId;
        
        // Force close calendar dropdown if open to prevent conflicts
        if (isCalendarMenuOpen) {
            closeCalendarDropdownRobust();
        }
        
        // Store references for tracking and later cleanup
        currentOpenDayItemId = itemId;
        currentOpenDayElement = $item;
        currentDayData = dayData;
        
        // Show the dayDropdown inside this specific item
        if ($item('#dayDropdown')) {
            $item('#dayDropdown').show();
            isDayMenuOpen = true;
            
            console.log('Day dropdown opened robustly for item:', itemId);
            
            // Setup global click listener with delay to handle outside clicks
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
        // Reset state on error to prevent inconsistent state
        performDayDropdownStateReset();
    }
}

/**
 * Close day dropdown with complete state cleanup
 * Properly closes dropdown and resets all associated state variables
 */
function closeDayDropdownRobust() {
    console.log('Closing day dropdown robustly for item:', currentOpenDayItemId);
    
    try {
        // Hide dropdown in specific element to prevent flash effects
        if (currentOpenDayElement && currentOpenDayElement('#dayDropdown')) {
            currentOpenDayElement('#dayDropdown').hide();
        }
        
        // Perform complete state reset to ensure clean state
        performDayDropdownStateReset();
        
        console.log('Day dropdown closed robustly');
        
    } catch (error) {
        console.error('Error closing day dropdown robustly:', error);
        // Force state reset on error to prevent stuck states
        performDayDropdownStateReset();
    }
}

/**
 * Perform complete day dropdown state reset
 * Resets all day dropdown related state variables
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
 * Setup repeater item handlers with robust event management
 * Configures the 42-element calendar repeater with proper event handling
 */
function setupRepeaterHandlers() {
    console.log('Setting up repeater handlers...');
    
    // Clear repeater to avoid stale state and prevent conflicts
    $w('#calendarRepeater').data = [];
    
    // Setup onItemReady callback before setting data - critical for proper initialization
    $w('#calendarRepeater').onItemReady(($item, itemData, index) => {
        console.log(`Setting up calendar day ${index}: ${itemData.dateKey}`, itemData);
        
        try {
            // Set day number and apply centralized text color based on day of week
            $item('#dayText').text = itemData.dayNumber.toString();
            $item('#dayText').style.color = itemData.textColor;
            
            // Set background color with centralized color management
            $item('#dayBox').style.backgroundColor = itemData.backgroundColor;
            
            // Apply 4px border with coordinated colors using separate properties (Wix Style API compatible)
            $item('#dayBox').style.borderColor = itemData.borderColor;
            $item('#dayBox').style.borderWidth = "4px";
            
            // Setup interactive elements based on availability data
            setupStatusButton($item, itemData, index);
            setupBookingCounter($item, itemData);
            setupSeasonTags($item, itemData);
            
            // IMPORTANT: Hide the dayDropdown initially in each item to prevent visual glitches
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
 * Setup tour selector dropdown using urlName for display with improved timing
 * Loads tours from database and populates dropdown options with proper loading feedback
 * Now waits 2 seconds after population before showing ready state
 */
async function setupTourSelector() {
    try {
        console.log('Starting tour dropdown population...');
        appendLog('Loading tours from database...');
        
        // Get all tours from database ordered by urlName for consistent display
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
        
        // Create dropdown options using urlName for display (user-friendly naming)
        const options = [{ label: '-- Select a tour --', value: '' }];
        
        toursQuery.items.forEach(tour => {
            options.push({
                label: tour.urlName || tour.title || tour._id || 'Unnamed Tour',
                value: tour._id
            });
        });
        
        // Set dropdown options and store tour data for later reference
        $w('#tourSelector').options = options;
        toursData = toursQuery.items;
        $w('#tourSelector').onChange(onTourSelected);
        
        appendLog(`Successfully loaded ${toursQuery.items.length} tours in dropdown`);
        console.log('Tour dropdown populated successfully');
        
        // Wait 2 seconds after dropdown population to ensure proper rendering before showing ready state
        updateSystemStatus('Loading system...');
        appendLog('Waiting for tour selector to complete rendering...');
        
        setTimeout(() => {
            updateSystemStatus('Ready - Select a tour');
            appendLog('Tour selector ready - user can now select a tour');
            console.log('Tour selector fully ready after 2 second delay');
        }, 2000);
        
    } catch (error) {
        console.error('Error setting up tour selector:', error);
        appendLog(`Error loading tours: ${error.message}`);
        updateSystemStatus('Error loading tours');
        $w('#tourSelector').options = [{ label: 'Error loading tours', value: '' }];
    }
}

/**
 * Handle tour selection with automatic current month reset and navigation button management
 * Processes tour selection and loads corresponding availability data
 * Enhanced with improved validation for corrupted availability data
 */
async function onTourSelected(event) {
    const selectedValue = event.target.value;
    
    if (!selectedValue) {
        // Reset to initial state when no tour selected
        showLoadingState();
        currentTourId = null;
        currentTourLabel = '';
        lastSelectedTourId = null;
        availabilityData = {};
        availabilityRecord = null;
        
        // Reset month dropdown and display current date
        resetMonthDropdown();
        
        // Hide navigation buttons when no tour is selected (prevents navigation bugs)
        hideNavigationButtons();
        
        updateSystemStatus('Select a tour to begin');
        return;
    }
    
    // Always force refresh by clearing previous data to ensure clean state
    availabilityData = {};
    availabilityRecord = null;
    
    // Reset month dropdown for new tour
    resetMonthDropdown();
    
    // Reset current date to today when selecting a tour to prevent navigation bugs
    currentDate = new Date();
    updateCalendarDisplay();
    
    // Set tour ID and find label using urlName for user-friendly display
    currentTourId = selectedValue;
    lastSelectedTourId = selectedValue;
    const selectedTour = toursData.find(tour => tour._id === selectedValue);
    currentTourLabel = selectedTour ? (selectedTour.urlName || selectedTour.title || selectedTour._id) : selectedValue;
    
    showLoadingAnimation();
    updateSystemStatus('Loading availability data...');
    
    try {
        appendLog(`Loading availability for: ${currentTourLabel}`);
        
        // Always fetch fresh data from database to ensure accuracy
        const availabilityQuery = await wixData.query('Availability')
            .eq('tourName', currentTourId)
            .find();
        
        if (availabilityQuery.items.length === 0) {
            appendLog('No availability record found for selected tour');
            showLoadingState();
            updateSystemStatus('No availability data found');
            
            // Show error lightbox for missing availability using improved error handling
            showAvailabilityErrorLightbox();
            return;
        }
        
        // Check if availability record has proper data structure
        const availabilityRecordItem = availabilityQuery.items[0];
        
        // Enhanced validation for corrupted or empty availability data
        if (!availabilityRecordItem.availabilityData || 
            !Array.isArray(availabilityRecordItem.availabilityData) || 
            availabilityRecordItem.availabilityData.length === 0 ||
            (availabilityRecordItem.availabilityData.length === 1 && availabilityRecordItem.availabilityData[0] === "")) {
            
            appendLog('Availability record exists but contains no valid date data or corrupted data');
            showLoadingState();
            updateSystemStatus('Corrupted or empty availability data found');
            
            // Show error lightbox for corrupted availability
            showAvailabilityErrorLightbox();
            return;
        }
        
        // Store availability record and load fresh data
        availabilityRecord = availabilityRecordItem;
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
 * Show error lightbox when availability is missing or corrupted
 * Displays appropriate error message and offers regeneration option
 */
function showAvailabilityErrorLightbox() {
    const errorMessage = "C'è un errore nelle disponibilità del tour, non sono state rilevate date nel database. Si prega di ricreare il database con la funzione 'Generate Availabilities' nel Calendar menu.";
    
    // Show lightbox with error message and generation option
    wixWindow.openLightbox("availabilityErrorLightbox", {
        errorMessage: errorMessage,
        tourId: currentTourId,
        action: "regenerate"
    }).then((result) => {
        if (result && result.action === "regenerated") {
            // Reload data after regeneration
            onTourSelected({ target: { value: currentTourId } });
        }
    }).catch((error) => {
        console.error("Error in availability error lightbox:", error);
    });
}

/**
 * Load availability data from database array field with improved date handling
 * Processes availability data from database and creates lookup object
 */
async function loadAvailabilityData() {
    if (!currentTourId || !availabilityRecord) return;
    
    try {
        appendLog('Processing availability data...');
        availabilityData = {};
        
        // Process availabilityData array from database record
        if (availabilityRecord.availabilityData && Array.isArray(availabilityRecord.availabilityData)) {
            availabilityRecord.availabilityData.forEach(item => {
                // Skip empty string entries that might be corrupted data
                if (typeof item === 'string' && item === '') {
                    return;
                }
                
                // Use simple date format without JST conversion for key matching consistency
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
 * Determines min and max months that have availability data
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
 * Generate calendar data for 42-day calendar grid (6 weeks x 7 days)
 * Creates data for calendar visualization with proper month detection
 */
function generateCalendarData() {
    const viewYear = currentDate.getFullYear();
    const viewMonth = currentDate.getMonth();
    
    console.log(`Generating calendar for ${MONTH_NAMES[viewMonth]} ${viewYear}`);
    
    // Calculate calendar boundaries for 42-day grid
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
    const firstDayOfWeek = firstDayOfMonth.getDay();
    const lastDayOfMonth = new Date(viewYear, viewMonth + 1, 0);
    const lastDateOfMonth = lastDayOfMonth.getDate();
    const prevMonthLastDay = new Date(viewYear, viewMonth, 0).getDate();
    
    const calendarData = [];
    
    // Fill previous month days to complete first week
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
    
    // Fill next month days to reach 42 days total (6 weeks)
    const remainingDays = 42 - calendarData.length;
    for (let day = 1; day <= remainingDays; day++) {
        const date = new Date(viewYear, viewMonth + 1, day);
        calendarData.push(createDayData(date, day, viewYear, viewMonth));
    }
    
    console.log('Generated calendar data:', calendarData.length, 'days for', MONTH_NAMES[viewMonth], viewYear);
    return calendarData;
}

/**
 * Create day data object with centralized color management and proper styling
 * Applies all color rules including weekday colors, borders, and backgrounds
 */
function createDayData(date, dayNumber, viewYear, viewMonth) {
    const dayOfWeek = date.getDay();
    const dateKey = formatDateKeySimple(date);
    const availability = availabilityData[dateKey] || null;
    
    // Improved month detection for accurate current month highlighting
    const isCurrentMonth = date.getMonth() === viewMonth && date.getFullYear() === viewYear;
    
    // Determine text color based on day of week using centralized colors
    let textColor = COLORS.TEXT_NORMAL; // Default weekdays
    if (dayOfWeek === 0) { // Sunday
        textColor = COLORS.TEXT_SUNDAY;
    } else if (dayOfWeek === 6) { // Saturday
        textColor = COLORS.TEXT_SATURDAY;
    }
    
    // Calculate background and border colors with proper today detection
    let backgroundColor, borderColor;
    const today = new Date();
    const isToday = date.getDate() === today.getDate() && 
                   date.getMonth() === today.getMonth() && 
                   date.getFullYear() === today.getFullYear();
    
    if (isCurrentMonth) {
        backgroundColor = COLORS.BG_CURRENT_MONTH;
        borderColor = isToday ? COLORS.BORDER_TODAY : COLORS.BORDER_CURRENT_MONTH;
    } else {
        backgroundColor = COLORS.BG_OTHER_MONTH;
        borderColor = COLORS.BORDER_OTHER_MONTH;
    }
    
    // Get availability information with defaults
    const seasonInfo = availability ? availability.season : 'normal';
    const status = availability ? availability.status : 'available';
    const bookedParticipants = availability ? (availability.bookedParticipants || 0) : 0;
    const hasData = availability !== null;
    
    // Create valid ID for Wix repeater (required for proper element targeting)
    const validId = `d-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
    
    return {
        _id: validId,
        dayNumber: dayNumber,
        dateKey: dateKey,
        date: date,
        isCurrentMonth: isCurrentMonth,
        textColor: textColor,
        backgroundColor: backgroundColor,
        borderColor: borderColor,
        status: status,
        bookedParticipants: bookedParticipants,
        season: seasonInfo,
        availability: availability,
        hasAvailabilityData: hasData
    };
}

/**
 * Populate calendar repeater with generated data
 * Sets calendar data without causing flash effects during updates
 */
async function populateCalendar() {
    try {
        appendLog('Generating calendar data...');
        updateSystemStatus('Populating calendar...');
        
        const calendarData = generateCalendarData();
        console.log('Setting repeater data with', calendarData.length, 'items');
        
        // Clear existing data first to ensure clean state
        $w('#calendarRepeater').data = [];
        
        // Wait a moment for clearing to complete (prevents flash effects)
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Set new data - repeater handlers will automatically process each item
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
 * Check if a date is in the past (before today)
 * Returns true if the date is before today's date
 */
function isDateInPast(date) {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    return checkDate < todayStart;
}

/**
 * Setup status button with improved visibility control and centralized colors
 * Configures button appearance and click handler for status management
 * Hides button for past dates in current month
 */
function setupStatusButton($item, itemData, index) {
    console.log(`Setting up status button for day ${itemData.dayNumber}: hasData=${itemData.hasAvailabilityData}, isCurrentMonth=${itemData.isCurrentMonth}`);
    
    // Hide status button for days without availability data
    if (!itemData.hasAvailabilityData) {
        $item('#statusButton').hide();
        console.log(`Hiding status button for day ${itemData.dayNumber} - no availability data`);
        return;
    }
    
    // Hide status button for past dates in current month
    if (itemData.isCurrentMonth && isDateInPast(itemData.date)) {
        $item('#statusButton').hide();
        console.log(`Hiding status button for day ${itemData.dayNumber} - past date in current month`);
        return;
    }
    
    $item('#statusButton').show();
    console.log(`Showing status button for day ${itemData.dayNumber} with status ${itemData.status}`);
    
    const statusConfig = STATUS_CONFIG[itemData.status] || STATUS_CONFIG.available;
    
    // Apply status styling with centralized colors
    $item('#statusButton').label = statusConfig.text;
    $item('#statusButton').style.backgroundColor = statusConfig.color;
    $item('#statusButton').style.color = '#FFFFFF';
    
    // Setup click handler for status toggle
    $item('#statusButton').onClick(async () => {
        await toggleDayStatusWithoutFlash(itemData, $item);
    });
}

/**
 * Toggle day status with enhanced update mechanism to prevent flash
 * Updates only the specific changed element without reloading entire calendar
 */
async function toggleDayStatusWithoutFlash(dayData, $item) {
    let newStatus;
    
    // Determine new status based on current status (cycling behavior)
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
        
        // Update local data without reloading entire calendar (prevents flash)
        if (availabilityData[dayData.dateKey]) {
            availabilityData[dayData.dateKey].status = newStatus;
        }
        
        // Update only this specific item's display directly (no calendar reload)
        dayData.status = newStatus;
        const statusConfig = STATUS_CONFIG[newStatus];
        
        // Update button appearance directly without full refresh
        $item('#statusButton').label = statusConfig.text;
        $item('#statusButton').style.backgroundColor = statusConfig.color;
        
        appendLog(`Status updated to ${statusConfig.text}`);
        updateSystemStatus('Ready');
        
    } catch (error) {
        console.error('Error updating status:', error);
        appendLog(`Error updating status: ${error.message}`);
        updateSystemStatus('Error updating status');
    }
}

/**
 * Set day as not operating status without flash
 * Updates only the specific changed element using the same pattern as toggle status
 */
async function setDayNotOperatingWithoutFlash(dayData) {
    try {
        updateSystemStatus('Setting not operating...');
        appendLog(`Setting ${dayData.dateKey} as not operating`);
        
        // Update status in database
        await updateAvailabilityStatus(dayData.dateKey, 'notoperating');
        
        // Update local data without reloading entire calendar (prevents flash)
        if (availabilityData[dayData.dateKey]) {
            availabilityData[dayData.dateKey].status = 'notoperating';
        }
        
        // Find and update the specific calendar item without flash
        $w('#calendarRepeater').forEachItem(($item, itemData) => {
            if (itemData.dateKey === dayData.dateKey) {
                // Update item data
                itemData.status = 'notoperating';
                
                // Update button appearance directly without full refresh
                const statusConfig = STATUS_CONFIG.notoperating;
                $item('#statusButton').label = statusConfig.text;
                $item('#statusButton').style.backgroundColor = statusConfig.color;
            }
        });
        
        appendLog('Day set as not operating');
        updateSystemStatus('Ready');
        
    } catch (error) {
        console.error('Error setting day as not operating:', error);
        appendLog(`Error setting not operating: ${error.message}`);
        updateSystemStatus('Error setting day status');
    }
}

/**
 * Refresh availability states without flash after generation
 * Updates all calendar elements with new states without reloading the calendar
 */
async function refreshAvailabilityStatesWithoutFlash() {
    try {
        updateSystemStatus('Refreshing availability states...');
        appendLog('Refreshing calendar states without flash...');
        
        // Reload availability data from database
        await loadAvailabilityData();
        
        // Reset month dropdown to trigger repopulation with new data
        resetMonthDropdown();
        
        // Update each calendar item without reloading the entire calendar
        $w('#calendarRepeater').forEachItem(($item, itemData) => {
            const dateKey = itemData.dateKey;
            const newAvailability = availabilityData[dateKey];
            
            if (newAvailability) {
                // Update item data
                itemData.status = newAvailability.status;
                itemData.hasAvailabilityData = true;
                itemData.bookedParticipants = newAvailability.bookedParticipants || 0;
                
                // Show/hide status button based on date and availability
                const isPastDate = itemData.isCurrentMonth && isDateInPast(itemData.date);
                if (isPastDate) {
                    $item('#statusButton').hide();
                } else {
                    $item('#statusButton').show();
                    const statusConfig = STATUS_CONFIG[newAvailability.status] || STATUS_CONFIG.available;
                    $item('#statusButton').label = statusConfig.text;
                    $item('#statusButton').style.backgroundColor = statusConfig.color;
                }
                
                // Update booking counter
                $item('#bookingCounterButton').label = itemData.bookedParticipants.toString();
                
                console.log(`Updated ${dateKey} to ${newAvailability.status} without flash`);
            } else {
                // Hide status button for days without availability data
                $item('#statusButton').hide();
                itemData.hasAvailabilityData = false;
            }
        });
        
        appendLog('Calendar states refreshed successfully without flash');
        updateSystemStatus('Ready');
        
    } catch (error) {
        console.error('Error refreshing availability states:', error);
        appendLog(`Error refreshing states: ${error.message}`);
        updateSystemStatus('Error refreshing states');
    }
}

/**
 * Legacy toggle day status function - maintains compatibility with existing code
 * Wrapper for the new flash-free version with corrected $item parameter handling
 */
async function toggleDayStatus(dayData, $itemElement = null) {
    // This function is kept for compatibility but uses the new flash-free version
    await toggleDayStatusWithoutFlash(dayData, $itemElement);
    
    // Force refresh if no specific item provided (fallback behavior)
    if (!$itemElement) {
        await forceRefreshTourData();
    }
}

/**
 * Setup booking counter display
 * Shows current booking count for the day
 */
function setupBookingCounter($item, itemData) {
    $item('#bookingCounterButton').label = itemData.bookedParticipants.toString();
}

/**
 * Setup season tags with proper data handling
 * Shows high/normal season indicators based on season data
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
 * Configures calendar menu button with proper state management
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
                // Close day dropdown if open to prevent conflicts
                if (isDayMenuOpen) {
                    closeDayDropdownRobust();
                }
                // Wait a moment then open calendar dropdown for clean transition
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
 * Configures dropdown menu items and their click handlers
 */
function setupDropdownElements() {
    // Ensure dropdown elements are hidden initially
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
 * Shows calendar menu dropdown with proper state tracking
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
 * Hides calendar dropdown and resets associated state
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
 * Processes calendar-level menu actions with proper validation
 * Enhanced with improved completion flow including success message and no-flash refresh
 */
async function handleCalendarMenuAction(action) {
    closeCalendarDropdownRobust();
    appendLog(`Calendar action: ${action}`);
    
    switch (action) {
        case 'generateAvailabilities':
            // Check if tour is selected before proceeding
            if (!currentTourId) {
                await wixWindow.openLightbox('messageLightbox', {
                    message: 'Select a tour from the menu.'
                });
                return;
            }
            
            // Enhanced confirmation with tour information
            const confirmMessage = `This operation will generate availability dates for tour:\n\n"${currentTourLabel}".\n\nIf availabilities are already present, the database will be rebuilt.\nSoldout/available statuses and existing bookings will be preserved.\n\nContinue?`;
            
            try {
                const result = await wixWindow.openLightbox('confirmLightbox2', {
                    message: confirmMessage
                });
                
                if (result === 'confirm') {
                    updateSystemStatus('Generating availabilities...');
                    appendLog('Starting availability generation process');
                    
                    // Call backend function with enhanced generation logic
                    await handleGenerateAvailabilitiesComplete();
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
 * Handle complete availability generation process with enhanced backend integration
 * UPDATED: Now uses proper backend functions with validation from availabilityCore
 * Includes proper success messaging and no-flash calendar refresh
 */
async function handleGenerateAvailabilitiesComplete() {
    if (!currentTourId) {
        updateSystemStatus('No tour selected');
        return;
    }
    
    try {
        updateSystemStatus('Generating availabilities...');
        appendLog('Calling backend availability generation function');
        
        // Get selected tour data for generation
        const selectedTour = toursData.find(tour => tour._id === currentTourId);
        if (!selectedTour) {
            throw new Error('Selected tour data not found');
        }
        
        // UPDATED: Check if availability already exists to decide between creation and regeneration
        const existingAvailability = await wixData.query('Availability')
            .eq('tourName', currentTourId)
            .find();
        
        let result;
        
        if (existingAvailability.items.length > 0) {
            // Availability exists, use regeneration function
            appendLog('Existing availability found, regenerating...');
            result = await generateAvailabilityForTour(currentTourId, true); // true = manual regeneration
        } else {
            // No availability exists, create initial availability
            appendLog('No existing availability, creating initial...');
            result = await createInitialAvailability(selectedTour);
        }
        
        if (result && (result.status === 'SUCCESS' || result._id)) {
            // Refresh calendar states without flash before showing success message
            updateSystemStatus('Refreshing calendar...');
            appendLog('Availability generation successful, refreshing states...');
            
            // Use the no-flash refresh method
            await refreshAvailabilityStatesWithoutFlash();
            
            // Show success message after calendar refresh
            await wixWindow.openLightbox('messageLightbox', {
                message: 'Availability generation completed successfully! All dates have been generated and the calendar has been updated.'
            });
            
            appendLog('Availability generation completed successfully');
            updateSystemStatus('Ready');
        } else {
            throw new Error(result ? result.error : 'Unknown error in generation');
        }
        
    } catch (error) {
        console.error('Error generating availabilities:', error);
        appendLog(`Error generating availabilities: ${error.message}`);
        updateSystemStatus('Error generating availabilities');
        
        // Show error message to user
        await wixWindow.openLightbox('messageLightbox', {
            message: `Error generating availabilities: ${error.message}`
        });
    }
}

/**
 * Handle day menu actions
 * Processes day-specific menu actions with enhanced no-flash methods
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
            // Use new no-flash method for setting not operating
            await setDayNotOperatingWithoutFlash(data);
            break;
    }
}

/**
 * Update availability status in database without adding updatedAt to array items
 * Updates database record with clean data structure
 */
async function updateAvailabilityStatus(dateKey, newStatus) {
    if (!currentTourId || !availabilityRecord) return;
    
    try {
        // Preserve all existing record fields to maintain data integrity
        const updateData = {
            _id: availabilityRecord._id,
            availabilityId: availabilityRecord.availabilityId,
            tourName: availabilityRecord.tourName,
            tourId: availabilityRecord.tourId,
            closedPeriods: availabilityRecord.closedPeriods,
            updatedAt: getJSTDate(new Date())
        };
        
        // Process availability data array without corrupting existing structure
        const availabilityDataArray = [...(availabilityRecord.availabilityData || [])];
        const dateIndex = availabilityDataArray.findIndex(item => {
            // Skip string entries that might be corrupted
            if (typeof item === 'string') return false;
            
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
            availabilityDataArray.push({
                date: dateKey,
                status: newStatus,
                bookedParticipants: 0,
                season: 'normal'
            });
        }
        
        // Update database with clean array data
        updateData.availabilityData = availabilityDataArray;
        await wixData.update('Availability', updateData);
        
        // Update local availability record to maintain consistency
        availabilityRecord.availabilityData = availabilityDataArray;
        
        console.log('Database updated successfully');
        
    } catch (error) {
        console.error('Error updating availability status:', error);
        throw error;
    }
}

/**
 * Force complete refresh of tour data to ensure UI reflects database state
 * Reloads all tour data from database for consistency
 */
async function forceRefreshTourData() {
    if (!currentTourId) return;
    
    try {
        // Clear all cached data to ensure fresh state
        availabilityData = {};
        availabilityRecord = null;
        
        // Reset month dropdown
        resetMonthDropdown();
        
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
 * Manages time slot configuration for specific days
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
 * Legacy set day not operating function - maintains compatibility
 * Wrapper that redirects to the new no-flash version
 */
async function setDayNotOperating(dayData) {
    // Use the new no-flash method instead of the old refresh method
    await setDayNotOperatingWithoutFlash(dayData);
}

/**
 * Setup navigation buttons with tour selection requirement
 * Configures month navigation with proper validation and enhanced dropdown sync
 */
function setupNavigationButtons() {
    if ($w('#prevMonthButton')) {
        $w('#prevMonthButton').onClick(() => {
            // Only allow navigation if tour is selected (prevents navigation bugs)
            if (currentTourId) {
                changeMonth(-1);
            }
        });
    }
    
    if ($w('#nextMonthButton')) {
        $w('#nextMonthButton').onClick(() => {
            // Only allow navigation if tour is selected (prevents navigation bugs)
            if (currentTourId) {
                changeMonth(1);
            }
        });
    }
}

/**
 * Hide navigation buttons when no tour is selected to prevent navigation bugs
 * Ensures navigation is only available when appropriate
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
 * Manages navigation button state based on data availability
 */
function updateNavigationButtons() {
    // Show buttons only if tour is selected
    if (!currentTourId) {
        hideNavigationButtons();
        return;
    }
    
    // If no date range, show both buttons (allow free navigation)
    if (!availableDateRange.min || !availableDateRange.max) {
        $w('#prevMonthButton').show();
        $w('#nextMonthButton').show();
        return;
    }
    
    // Check if current month is within available range
    const currentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const minMonth = new Date(availableDateRange.min.getFullYear(), availableDateRange.min.getMonth(), 1);
    const maxMonth = new Date(availableDateRange.max.getFullYear(), availableDateRange.max.getMonth(), 1);
    
    // Show/hide previous button based on range
    if (currentMonth.getTime() <= minMonth.getTime()) {
        $w('#prevMonthButton').hide();
    } else {
        $w('#prevMonthButton').show();
    }
    
    // Show/hide next button based on range
    if (currentMonth.getTime() >= maxMonth.getTime()) {
        $w('#nextMonthButton').hide();
    } else {
        $w('#nextMonthButton').show();
    }
    
    console.log('Navigation buttons updated for current month:', MONTH_NAMES[currentDate.getMonth()], currentDate.getFullYear());
}

/**
 * Update calendar display when navigating months
 * Refreshes the month/year display elements
 */
function updateCalendarDisplay() {
    const currentMonthName = MONTH_NAMES[currentDate.getMonth()];
    const currentYear = currentDate.getFullYear();
    
    // Update year display
    $w('#yearText').text = currentYear.toString();
    
    // Update month dropdown to show current month
    if (isMonthDropdownPopulated) {
        const currentMonthValue = `${currentYear}-${String(currentDate.getMonth()).padStart(2, '0')}`;
        const currentMonth = availableMonths.find(month => month.value === currentMonthValue);
        
        if (currentMonth) {
            $w('#calendarMonth').value = currentMonth.value;
        }
    } else {
        // Reset to simple display when dropdown not populated
        $w('#calendarMonth').options = [{ 
            label: `${currentMonthName} ${currentYear}`,
            value: `${currentYear}-${String(currentDate.getMonth()).padStart(2, '0')}` 
        }];
        $w('#calendarMonth').value = `${currentYear}-${String(currentDate.getMonth()).padStart(2, '0')}`;
    }
    
    console.log(`Calendar display updated to: ${currentMonthName} ${currentYear}`);
}

/**
 * Change month navigation with proper validation
 * Handles month navigation with boundary checks
 */
function changeMonth(direction) {
    if (!currentTourId) return;
    
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1);
    
    // Check if new month is within available range
    if (availableDateRange.min && availableDateRange.max) {
        const newMonth = new Date(newDate.getFullYear(), newDate.getMonth(), 1);
        const minMonth = new Date(availableDateRange.min.getFullYear(), availableDateRange.min.getMonth(), 1);
        const maxMonth = new Date(availableDateRange.max.getFullYear(), availableDateRange.max.getMonth(), 1);
        
        if (newMonth.getTime() < minMonth.getTime() || newMonth.getTime() > maxMonth.getTime()) {
            console.log('Month navigation blocked - outside available range');
            return;
        }
    }
    
    currentDate = newDate;
    updateCalendarDisplay();
    updateNavigationButtons();
    
    // Reload calendar for new month
    if (availabilityRecord) {
        updateSystemStatus('Loading month data...');
        populateCalendar().then(() => {
            updateSystemStatus('Ready');
        });
    }
    
    const monthName = MONTH_NAMES[currentDate.getMonth()];
    const year = currentDate.getFullYear();
    appendLog(`Navigated to ${monthName} ${year}`);
}

/**
 * Show loading state for UI feedback
 * Displays loading animation and hides calendar
 */
function showLoadingState() {
    $w('#repeaterBox').collapse();
    $w('#loadingBox').expand();
    console.log('Loading state shown');
}

/**
 * Show loading animation during data operations
 * Provides visual feedback during async operations
 */
function showLoadingAnimation() {
    $w('#repeaterBox').collapse();
    $w('#loadingBox').expand();
    console.log('Loading animation shown');
}

/**
 * Show calendar state after data loading
 * Displays calendar and hides loading elements
 */
function showCalendarState() {
    $w('#loadingBox').collapse();
    $w('#repeaterBox').expand();
    console.log('Calendar state shown');
}

/**
 * Update system status message
 * Updates the status message display for user feedback
 */
function updateSystemStatus(message) {
    $w('#statusMessage').text = message;
    console.log('Status updated:', message);
}

/**
 * Append log message to system log
 * Adds timestamped log entries for debugging and monitoring
 */
function appendLog(message) {
    const timestamp = new Date().toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo' });
    const logEntry = `[${timestamp}] ${message}`;
    
    // Get current log content
    const currentLog = $w('#logOutput').text || '';
    const logLines = currentLog.split('\n').filter(line => line.trim() !== '');
    
    // Add new entry
    logLines.push(logEntry);
    
    // Keep only last 50 entries to prevent overflow
    if (logLines.length > 50) {
        logLines.splice(0, logLines.length - 50);
    }
    
    // Update log display
    $w('#logOutput').text = logLines.join('\n');
    
    console.log('Log appended:', message);
}

/**
 * Format date to simple key format for consistency
 * Converts date to YYYY-MM-DD format for database keys
 */
function formatDateKeySimple(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Get JST date for database operations
 * Converts date to Japan Standard Time for consistent database operations
 */
function getJSTDate(date) {
    return new Date(date.getTime() + JST_OFFSET);
}

/**
 * Export functions for external access
 * Allows other components to access these functions
 */
export function getTourData() {
    return {
        currentTourId: currentTourId,
        currentTourLabel: currentTourLabel,
        availabilityData: availabilityData,
        availabilityRecord: availabilityRecord
    };
}

export function getCurrentDate() {
    return currentDate;
}

export function refreshCalendar() {
    if (currentTourId && availabilityRecord) {
        populateCalendar();
    }
}

// Export navigation functions for external use
export function navigateToPreviousMonth() {
    changeMonth(-1);
}

export function navigateToNextMonth() {
    changeMonth(1);
}

/**
 * Initialize availability manager for external calls
 * Allows external components to trigger initialization
 */
export function initializeAvailabilityManager() {
    if (!isInitializationComplete) {
        console.log('Availability Manager not yet initialized');
        return false;
    }
    return true;
}

/**
 * Get current system status for external monitoring
 * Provides system status information to external components
 */
export function getSystemStatus() {
    return {
        isInitialized: isInitializationComplete,
        currentTourId: currentTourId,
        hasAvailabilityData: Object.keys(availabilityData).length > 0,
        currentMonth: currentDate.getMonth(),
        currentYear: currentDate.getFullYear(),
        availableDateRange: availableDateRange
    };
}
