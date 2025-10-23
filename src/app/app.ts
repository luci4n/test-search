import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  Output,
  EventEmitter,
  Input,
} from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Subject, Subscription, TimeoutError, of } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  switchMap,
  catchError,
  retry,
  timeout,
  tap,
} from 'rxjs/operators';

interface SearchResponse {
  query: string;
  results: string[];
}

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  @ViewChild('searchInput') searchInputRef!: ElementRef<HTMLInputElement>;
  @Output() resultSelected = new EventEmitter<string>();
  @Input() placeholder = 'Search fruits...';
  @Input() debounceTime = 300;
  @Input() showDebugInfo = false;

  // State management
  searchTerm = '';
  results: string[] = [];
  selectedValue: string | null = null;
  selectedIndex = -1;

  // UI states
  isLoading = false;
  hasError = false;
  hasSearched = false;
  showDropdown = false;
  isDisabled = false;
  showErrorToast = false;

  // Error handling
  errorMessage = '';
  toastMessage = '';
  errorCount = 0;
  requestCount = 0;

  // Performance tracking
  latency: number | null = null;

  // Popular suggestions
  popularFruits = ['apple', 'banana', 'orange', 'grape'];

  // Observables
  private searchSubject = new Subject<string>();
  private searchSubscription?: Subscription;
  private blurTimeout?: any;

  // API configuration
  private readonly API_URL = 'http://localhost:8000/api/search';
  private readonly REQUEST_TIMEOUT = 5000; // 5 seconds
  private readonly MAX_RETRIES = 2;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.setupSearchStream();
  }

  ngOnDestroy(): void {
    this.searchSubscription?.unsubscribe();
    if (this.blurTimeout) {
      clearTimeout(this.blurTimeout);
    }
  }

  /**
   * Setup the reactive search stream with debouncing, retries, and error handling
   */
  private setupSearchStream(): void {
    this.searchSubscription = this.searchSubject
      .pipe(
        // Debounce to avoid excessive API calls
        debounceTime(this.debounceTime),

        // Only proceed if the value actually changed
        distinctUntilChanged(),

        // Tap to track the request
        tap((term) => {
          if (term.trim()) {
            this.isLoading = true;
            this.hasError = false;
            this.requestCount++;
          }
        }),

        // Switch to new search, canceling previous
        switchMap((term) => {
          // Don't search for empty or whitespace-only strings
          if (!term.trim()) {
            return of({ query: term, results: [] });
          }

          const startTime = performance.now();

          return this.http
            .get<SearchResponse>(`${this.API_URL}?q=${encodeURIComponent(term)}`)
            .pipe(
              // Set timeout for the request
              timeout(this.REQUEST_TIMEOUT),

              // Retry failed requests
              retry({
                count: this.MAX_RETRIES,
                delay: (error, retryCount) => {
                  console.log(`Retry attempt ${retryCount} for query: ${term}`);
                  return of(null).pipe(debounceTime(1000 * retryCount));
                },
              }),

              // Track latency
              tap(() => {
                this.latency = Math.round(performance.now() - startTime);
              }),

              // Handle errors gracefully
              catchError((error: HttpErrorResponse) => {
                this.handleSearchError(error, term);
                return of({ query: term, results: [] });
              })
            );
        })
      )
      .subscribe((response) => {
        this.handleSearchResponse(response);
      });
  }

  /**
   * Handle input changes
   */
  onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = target.value;

    this.searchTerm = value;
    this.selectedIndex = -1;

    // Reset error state on new input
    if (this.hasError) {
      this.hasError = false;
      this.errorMessage = '';
    }

    // Show dropdown when user starts typing
    if (value || !this.hasSearched) {
      this.showDropdown = true;
    }

    // Emit the search term
    this.searchSubject.next(value);
  }

  /**
   * Handle input focus
   */
  onFocus(): void {
    if (this.blurTimeout) {
      clearTimeout(this.blurTimeout);
    }
    this.showDropdown = true;
  }

  /**
   * Handle input blur with delay to allow click events
   */
  onBlur(): void {
    this.blurTimeout = setTimeout(() => {
      this.showDropdown = false;
      this.selectedIndex = -1;
    }, 200);
  }

  /**
   * Handle keyboard navigation
   */
  onKeyDown(event: KeyboardEvent): void {
    if (!this.showDropdown) {
      if (event.key === 'ArrowDown' || event.key === 'Enter') {
        this.showDropdown = true;
        return;
      }
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.navigateResults(1);
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.navigateResults(-1);
        break;

      case 'Enter':
        event.preventDefault();
        if (this.selectedIndex >= 0 && this.results[this.selectedIndex]) {
          this.selectResult(this.results[this.selectedIndex]);
        } else if (this.results.length === 1) {
          // Auto-select if only one result
          this.selectResult(this.results[0]);
        }
        break;

      case 'Escape':
        event.preventDefault();
        this.showDropdown = false;
        this.selectedIndex = -1;
        this.searchInputRef.nativeElement.blur();
        break;

      case 'Tab':
        // Allow natural tab behavior but close dropdown
        this.showDropdown = false;
        break;
    }
  }

  /**
   * Navigate through results with arrow keys
   */
  private navigateResults(direction: number): void {
    if (!this.hasResults) return;

    const newIndex = this.selectedIndex + direction;

    if (newIndex < -1) {
      this.selectedIndex = this.results.length - 1;
    } else if (newIndex >= this.results.length) {
      this.selectedIndex = -1;
    } else {
      this.selectedIndex = newIndex;
    }

    // Scroll selected item into view
    this.scrollToSelectedItem();
  }

  /**
   * Scroll the selected item into view
   */
  private scrollToSelectedItem(): void {
    setTimeout(() => {
      const selectedElement = document.getElementById(`result-${this.selectedIndex}`);
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 0);
  }

  /**
   * Handle search response
   */
  private handleSearchResponse(response: SearchResponse): void {
    this.isLoading = false;
    this.hasSearched = true;

    if (response.results && response.results.length > 0) {
      this.results = response.results;
      this.hasError = false;
    } else if (this.searchTerm.trim()) {
      // Empty results for non-empty query
      this.results = [];
    }
  }

  /**
   * Handle search errors
   */
  private handleSearchError(error: HttpErrorResponse, term: string): void {
    this.isLoading = false;
    this.hasError = true;
    this.errorCount++;
    this.results = [];

    // Categorize error types
    if (error instanceof TimeoutError) {
      this.errorMessage = 'Request timed out. Please try again.';
    } else if (error.status === 0) {
      this.errorMessage = 'Cannot connect to server. Is it running?';
    } else if (error.status === 500) {
      this.errorMessage = 'Server error. This might be the 15% random failure.';
    } else if (error.status === 404) {
      this.errorMessage = 'Search endpoint not found.';
    } else if (error.error?.error) {
      this.errorMessage = error.error.error;
    } else {
      this.errorMessage = 'An unexpected error occurred.';
    }

    // Show toast for repeated errors
    if (this.errorCount >= 3) {
      this.showToast('Multiple errors detected. Check your connection.');
    }

    console.error('Search error:', error);
  }

  /**
   * Retry the last search
   */
  retry(): void {
    if (this.searchTerm.trim()) {
      this.hasError = false;
      this.errorMessage = '';
      this.searchSubject.next(this.searchTerm);
    }
  }

  /**
   * Clear the search input
   */
  clearSearch(): void {
    this.searchTerm = '';
    this.results = [];
    this.selectedIndex = -1;
    this.hasSearched = false;
    this.hasError = false;
    this.selectedValue = null;
    this.searchInputRef.nativeElement.focus();
  }

  /**
   * Select a search result
   */
  selectResult(result: string): void {
    this.selectedValue = result;
    this.searchTerm = result;
    this.showDropdown = false;
    this.resultSelected.emit(result);

    // Optional: Clear after selection
    // this.clearSearch();
  }

  /**
   * Select a suggested fruit
   */
  selectSuggestion(fruit: string): void {
    this.searchTerm = fruit;
    this.searchSubject.next(fruit);
    this.searchInputRef.nativeElement.focus();
  }

  /**
   * Remove the current selection
   */
  removeSelection(): void {
    this.selectedValue = null;
    this.clearSearch();
  }

  /**
   * Highlight matching text in results
   */
  highlightMatch(text: string, term: string): string {
    if (!term.trim()) return text;

    const regex = new RegExp(`(${this.escapeRegex(term)})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Show error toast
   */
  private showToast(message: string): void {
    this.toastMessage = message;
    this.showErrorToast = true;

    setTimeout(() => {
      this.showErrorToast = false;
    }, 5000);
  }

  /**
   * Dismiss toast manually
   */
  dismissToast(): void {
    this.showErrorToast = false;
  }

  /**
   * Computed properties
   */
  get hasResults(): boolean {
    return this.results.length > 0;
  }
}
