"""Team-id lookup inferred from each id's regular players and fixture dates (the CSV has ids only)."""
IPL = {"1": "CSK", "2": "MI", "3": "RR", "4": "PBKS", "5": "RCB", "7": "DC", "8": "KKR",
       "242": "SRH", "3508": "GT", "3509": "LSG"}
OTHER = {"18": "India", "25": "Pakistan", "28": "West Indies", "17": "New Zealand", "21": "Bangladesh",
         "27": "Sri Lanka", "22": "England", "20": "Australia", "72": "Zimbabwe", "78": "Afghanistan",
         "19": "South Africa", "23": "Ireland", "272": "UAE", "283": "Hong Kong", "24": "Netherlands",
         "313": "Oman", "26": "Scotland", "89": "Canada", "282": "Nepal", "311": "Singapore",
         "312": "Kuwait", "315": "USA", "3886": "Japan",
         "222": "India A", "341": "Pakistan Shaheens", "3674": "Sri Lanka A", "3093": "Bangladesh A",
         "4444": "Afghanistan A"}
NAME = {**IPL, **OTHER}

def is_ipl_match(team_ids) -> bool:
    """A match is IPL when every team in it is an IPL franchise (no mixed fixtures exist)."""
    return set(team_ids) <= set(IPL)
