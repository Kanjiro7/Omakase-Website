// Import required Wix APIs for database operations and UI management
import wixData from 'wix-data';
import wixWindow from 'wix-window';
import wixLocation from 'wix-location-frontend';
import { generateAvailabilityForTour } from 'backend/availability/availabilityCore.web.js';

// Color variables centralized for easy management and consistency
const COLORS = {
    // Text colors for days of week
    TEXT_NORMAL: '#262E39',        // Normal weekdays text color
    TEXT_SUNDAY: '#C13939',        // Sunday text color (red)
    TEXT_SATURDAY: '#405FB0',      // Saturday text color (blue)
    
    // Background colors for calendar days
    BG_CURRENT_MONTH: '#FFFFFF',   // Current month days background
    BG_OTHER_MONTH: '#EEECEC',     // Non-current month days background
    
    // Border colors (4px borders, coordinated with backgrounds)
    BORDER_CURRENT_MONTH: '#FFFFFF',  // Normal days border (matches background)
    BORDER_OTHER_MONTH: '#EEECEC',    // Non-current month days border (matches background)
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

// Initialize page when ready - sets up all components and handlers
$w.onReady(async function () {
    console.log('Availability Manager initializing...');
    appendLog('Availability Manager initializing...');
    
    // Complete system reset on page ready to prevent state issues
    performCompleteSystemReset();
    
    // Set initial loading state
    showLoadingState();
    updateSystemStatus('Loading system components...');
    
    // Initialize calendar display with current date
    updateCalendarDisplay();
    
    // Setup calendar month dropdown functionality - NEW FEATURE
    setupCalendarMonthDropdown();
    
    // Setup repeater handlers before any data operations - critical for proper initialization
    setupRepeaterHandlers();
    
    // Setup tour selector dropdown with database integration
    await setupTourSelector();
    
    // Setup navigation buttons with range checking for tour-based navigation
    setupNavigationButtons();
    
    // Setup menu buttons and dropdown functionality with robust state management
    setupMenuButtons();
    setupDropdownElements();
    
    // Initially hide navigation buttons since no tour is selected (prevents navigation bugs)
    hideNavigationButtons();
    
    appendLog('Availability Manager initialized successfully');
    updateSystemStatus('Ready - Select a tour');
    console.log('Availability Manager initialized successfully');
});

/**
 * Setup calendar month dropdown functionality - NEW FEATURE
 * Handles dynamic population and selection of available months
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
 * Populate month dropdown with available months from data - NEW FEATURE
 * Creates options in format "Month YYYY" from availability data
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
                label: `${monthName} ${year}`,  // Display format: "July 2025"
                value: monthYear,               // Value format: "2025-06"
                monthName: monthName,           // Just month name: "July"
                year: parseInt(year),           // Year as number: 2025
                monthIndex: parseInt(month)     // Month index: 6 for July
            };
        });
        
        // Set dropdown options
        $w('#calendarMonth').options = availableMonths.map(month => ({
            label: month.label,
            value: month.value
        }));
        
        // Set current month as selected
        const currentMonthValue = `${currentDate.getFullYear()}-${String(currentDate.getMonth()).padStart(2, '0')}`;
        const currentMonth = availableMonths.find(month => month.value === currentMonthValue);
        
        if (currentMonth) {
            $w('#calendarMonth').value = currentMonth.value;
            // Update display to show only month name
            setTimeout(() => {
                updateMonthDisplayText(currentMonth.monthName);
            }, 100);
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
 * Handle month dropdown selection change - NEW FEATURE
 * Updates calendar view and display when user selects a month
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
            
            // Update month display to show only month name (without year)
            updateMonthDisplayText(selectedMonth.monthName);
            
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
 * Update month display text to show only month name - NEW HELPER FUNCTION
 * Ensures dropdown shows only month name while maintaining full data in options
 */
function updateMonthDisplayText(monthName) {
    // Use setTimeout to ensure the DOM has updated
    setTimeout(() => {
        try {
            // This is a workaround to update the display text while keeping full options
            const monthDropdown = $w('#calendarMonth');
            
            // Create a temporary option with just the month name for display
            const currentOptions = monthDropdown.options;
            const currentValue = monthDropdown.value;
            
            // Update the selected option's label temporarily for display
            const updatedOptions = currentOptions.map(option => {
                if (option.value === currentValue) {
                    return { ...option, label: monthName };
                }
                return option;
            });
            
            // Update options to trigger display refresh
            monthDropdown.options = updatedOptions;
            monthDropdown.value = currentValue;
            
        } catch (error) {
            console.warn('Could not update month display text:', error);
        }
    }, 50);
}

/**
 * Reset month dropdown when tour changes - NEW HELPER FUNCTION
 * Clears dropdown state when switching tours
 */
function resetMonthDropdown() {
    isMonthDropdownPopulated = false;
    availableMonths = [];
    
    // Reset dropdown to empty state
    $w('#calendarMonth').options = [];
    
    console.log('Month dropdown reset for new tour');
}

/**
 * Perform complete system reset to prevent state accumulation - robust pattern
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
 * Force remove all click handlers to prevent accumulation - robust pattern
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
 * Setup global click listener with robust state management - improved pattern
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
 * Robust day dropdown toggle with complete state management - improved pattern
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
 * Open day dropdown with robust state tracking - improved pattern
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
 * Close day dropdown with complete state cleanup - improved pattern
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
 * Perform complete day dropdown state reset - robust pattern
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
 * Setup repeater item handlers with robust event management - improved pattern
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
    
    // Setup day menu button click handler with robust pattern to prevent accumulation
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
 * Loads tours from database and populates dropdown options
 */
async function setupTourSelector() {
    try {
        console.log('Starting tour dropdown population...');
        appendLog('Loading tours from database...');
        updateSystemStatus('Loading tours...');
        
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
 * Processes tour selection and loads corresponding availability data
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
        
        // Reset month dropdown
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
    updateSystemStatus('Loading fresh availability data...');
    
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
        if (!availabilityRecordItem.availabilityData || 
            !Array.isArray(availabilityRecordItem.availabilityData) || 
            availabilityRecordItem.availabilityData.length === 0) {
            
            appendLog('Availability record exists but contains no date data');
            showLoadingState();
            updateSystemStatus('Corrupted availability data found');
            
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
 * Setup status button with improved visibility control and centralized colors
 * Configures button appearance and click handler for status management
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
    
    // Apply status styling with centralized colors
    $item('#statusButton').label = statusConfig.text;
    $item('#statusButton').style.backgroundColor = statusConfig.color;
    $item('#statusButton').style.color = '#FFFFFF';
    
    // Setup click handler for status toggle (prevents flash during updates)
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
 * Set day as not operating status without flash - ENHANCED METHOD
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
 * Refresh availability states without flash after generation - ENHANCED METHOD
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
                
                // Show status button and update appearance
                $item('#statusButton').show();
                const statusConfig = STATUS_CONFIG[newAvailability.status] || STATUS_CONFIG.available;
                $item('#statusButton').label = statusConfig.text;
                $item('#statusButton').style.backgroundColor = statusConfig.color;
                
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
                    
                    // Call backend function using corrected function name from Testing Page logic
                    await handleGenerateAvailabilitiesFixed();
                    
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
 * Handle generate availabilities action with proper logic from Testing Page
 * Enhanced with no-flash state refresh after generation - UPDATED METHOD
 */
async function handleGenerateAvailabilitiesFixed() {
    if (!currentTourId) {
        updateSystemStatus('No tour selected');
        return;
    }
    
    try {
        updateSystemStatus('Generating availabilities...');
        appendLog('Calling backend availability generation function');
        
        // Call backend function using the corrected function name and logic from Testing Page
        const result = await generateAvailabilityForTour(currentTourId, false);
        
        if (result && result.status === "SUCCESS") {
            // Instead of reloading entire tour data, refresh states without flash
            updateSystemStatus('Refreshing calendar...');
            appendLog('Availability generation successful, refreshing states...');
            
            // Use the new no-flash refresh method
            await refreshAvailabilityStatesWithoutFlash();
            
            appendLog('Availability generation completed successfully');
            updateSystemStatus('Availabilities generated successfully');
        } else {
            throw new Error(result ? result.error : 'Unknown error in generation');
        }
        
    } catch (error) {
        console.error('Error generating availabilities:', error);
        appendLog(`Error generating availabilities: ${error.message}`);
        updateSystemStatus('Error generating availabilities');
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
 * Enhanced with dropdown synchronization for seamless navigation
 */
async function changeMonth(direction) {
    // Prevent navigation if no tour selected (prevents bugs)
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
    
    // Update month dropdown if populated - ENHANCED SYNC
    if (isMonthDropdownPopulated) {
        const currentMonthValue = `${currentDate.getFullYear()}-${String(currentDate.getMonth()).padStart(2, '0')}`;
        const currentMonth = availableMonths.find(month => month.value === currentMonthValue);
        
        if (currentMonth) {
            $w('#calendarMonth').value = currentMonth.value;
            // Update display to show only month name
            setTimeout(() => {
                updateMonthDisplayText(currentMonth.monthName);
            }, 100);
        }
    }
    
    appendLog(`Changed to ${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`);
    
    // Reload calendar if tour is selected and data is available
    if (currentTourId && availabilityRecord) {
        updateSystemStatus('Loading month data...');
        await populateCalendar();
        updateSystemStatus('Ready');
    }
}

/**
 * Update calendar month and year display - ENHANCED VERSION
 * Updates the calendar header with current month/year and maintains dropdown sync
 */
function updateCalendarDisplay() {
    // Update year text
    $w('#yearText').text = currentDate.getFullYear().toString();
    
    // Update month dropdown if not yet populated (initial state)
    if (!isMonthDropdownPopulated) {
        // For initial display before dropdown is populated, just show month name
        const monthName = MONTH_NAMES[currentDate.getMonth()];
        
        // Set initial options with current month only
        $w('#calendarMonth').options = [{ 
            label: monthName, 
            value: `${currentDate.getFullYear()}-${String(currentDate.getMonth()).padStart(2, '0')}` 
        }];
        $w('#calendarMonth').value = `${currentDate.getFullYear()}-${String(currentDate.getMonth()).padStart(2, '0')}`;
    }
}

/**
 * Show loading state with proper element management
 * Displays initial loading state before tour selection
 */
function showLoadingState() {
    $w('#loadingBox').expand();
    $w('#selectTourText').expand();
    $w('#loading').collapse();
    $w('#repeaterBox').collapse();
}

/**
 * Show loading animation during data operations
 * Displays loading animation during data fetching and processing
 */
function showLoadingAnimation() {
    $w('#loadingBox').expand();
    $w('#selectTourText').collapse();
    $w('#loading').expand();
    $w('#repeaterBox').collapse();
}

/**
 * Show calendar state when data is loaded
 * Displays calendar when data is successfully loaded and processed
 */
function showCalendarState() {
    $w('#loadingBox').collapse();
    $w('#selectTourText').expand();
    $w('#loading').collapse();
    $w('#repeaterBox').expand();
}

/**
 * Update system status message for user feedback
 * Provides real-time status updates to users
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
 * Maintains activity log with timestamped entries
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
            
            // Keep only last 100 log entries to prevent memory issues
            const lines = newLog.split('\n');
            $w('#logOutput').text = lines.slice(0, 100).join('\n');
        }
    } catch (error) {
        console.error('Error appending log:', error);
    }
}

/**
 * Get season info for a date - placeholder for future implementation
 * Determines if date falls within high season periods
 */
function getSeasonInfo(date) {
    // TODO: Implement high season period checking against HighSeasonPeriods collection
    return 'normal';
}

/**
 * JST date utility functions for timezone handling
 * Provides Japan Standard Time conversion utilities
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
 * Provides consistent date key format for database operations
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

// Export functions for testing and external access
export { 
    setupTourSelector,
    loadAvailabilityData,
    populateCalendar,
    toggleDayStatus,
    changeMonth
};
