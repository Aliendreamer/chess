// The Stockfish bridge for Swift (mobile-app D6): Swift cannot call the C++ bridge, so this Objective-C class forwards
// to it. Its callbacks arrive on the bridge's own threads.
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface SFBridge : NSObject

/** Starts the engine thread; NO when one is running. */
+ (BOOL)startWithFilesDir:(NSString *)filesDir
                  onLines:(void (^)(NSArray<NSString *> *lines))onLines
                   onExit:(void (^)(NSString *reason))onExit;

/** Queues one UCI line and returns at once. */
+ (void)send:(NSString *)line;

/** Sends `quit` and waits for the engine thread to end. */
+ (void)quit;

/** Reads and removes what the last run left: "crash" and "marker", each a string or NSNull. */
+ (NSDictionary<NSString *, id> *)takeFilesWithFilesDir:(NSString *)filesDir;

@end

NS_ASSUME_NONNULL_END
