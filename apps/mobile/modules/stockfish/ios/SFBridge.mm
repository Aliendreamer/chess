// See SFBridge.h (mobile-app D6).
#import "SFBridge.h"

#include <string>
#include <vector>

#include "bridge.h"

@implementation SFBridge

+ (BOOL)startWithFilesDir:(NSString *)filesDir
                  onLines:(void (^)(NSArray<NSString *> *lines))onLines
                   onExit:(void (^)(NSString *reason))onExit {
  void (^linesBlock)(NSArray<NSString *> *) = [onLines copy];
  void (^exitBlock)(NSString *) = [onExit copy];
  sfbridge::Callbacks callbacks{
      [linesBlock](std::vector<std::string> lines) {
        @autoreleasepool {
          NSMutableArray<NSString *> *array = [NSMutableArray arrayWithCapacity:lines.size()];
          for (const auto &line : lines) [array addObject:[NSString stringWithUTF8String:line.c_str()]];
          linesBlock(array);
        }
      },
      [exitBlock](const std::string &reason) {
        @autoreleasepool {
          exitBlock([NSString stringWithUTF8String:reason.c_str()]);
        }
      }};
  return sfbridge::start(callbacks, std::string(filesDir.UTF8String)) ? YES : NO;
}

+ (void)send:(NSString *)line {
  sfbridge::send(std::string(line.UTF8String));
}

+ (void)quit {
  sfbridge::quit();
}

+ (NSDictionary<NSString *, id> *)takeFilesWithFilesDir:(NSString *)filesDir {
  auto left = sfbridge::takeFiles(std::string(filesDir.UTF8String));
  id crash = left.crash.empty() ? (id)[NSNull null] : [NSString stringWithUTF8String:left.crash.c_str()];
  id marker = left.marker.empty() ? (id)[NSNull null] : [NSString stringWithUTF8String:left.marker.c_str()];
  return @{@"crash" : crash, @"marker" : marker};
}

@end
