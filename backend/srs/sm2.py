import datetime

def update_sm2(quality, interval, repetition, ef):
    """
    quality: 0-5 (0: Again, 3: Hard, 4: Good, 5: Easy)
    interval: current interval in days
    repetition: number of successful repetitions
    ef: easiness factor
    """
    if quality < 3:
        # Failed to remember
        repetition = 0
        interval = 1
    else:
        # Correctly remembered
        if repetition == 0:
            interval = 1
        elif repetition == 1:
            interval = 6
        else:
            interval = int(interval * ef)
        
        repetition += 1
        
        # Calculate new EF
        ef = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
        if ef < 1.3:
            ef = 1.3
            
    next_review = datetime.datetime.utcnow() + datetime.timedelta(days=interval)
    return next_review, interval, repetition, ef
